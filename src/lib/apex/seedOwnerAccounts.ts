import 'server-only';

import bcrypt from 'bcryptjs';
import { CONSENT_VERSION, LEGAL_DISCLAIMER_VERSION } from '@/types';
import { normalizeApexUsername } from '@/lib/apex/credentialType';
import { upsertTechnicianDealershipMembership } from '@/lib/apex/membershipGuard';
import {
  APEX_NATIONAL_DEALERSHIP_ID,
  APEX_NATIONAL_DEALERSHIP_NAME,
} from '@/lib/apex/platformConstants';
import { prisma } from '@/lib/db';

/** Second rooftop for multi-dealership selector demos and integration tests. */
export const APEX_SEED_SECOND_DEALERSHIP_ID = 'seed-dealership-2';

const seedCompliance = {
  consentAt: new Date(),
  consentVersion: CONSENT_VERSION,
  legalDisclaimerAt: new Date(),
  legalDisclaimerVersion: LEGAL_DISCLAIMER_VERSION,
};

export interface ApexOwnerSeedConfig {
  ownerEmail: string;
  ownerPassword: string;
  ownerName: string;
  multiRooftopUsername?: string;
  multiRooftopPassword?: string;
  multiRooftopName?: string;
}

/** Read apex owner + optional multi-rooftop seed credentials from env — never hardcoded. */
export function readApexOwnerSeedConfig(): ApexOwnerSeedConfig | null {
  const ownerEmail = process.env.OWNER_SEED_EMAIL?.trim().toLowerCase();
  const ownerPassword = process.env.OWNER_SEED_PASSWORD?.trim();
  if (!ownerEmail || !ownerPassword) return null;

  const multiUsernameRaw = process.env.MULTI_ROOFTOP_SEED_USERNAME?.trim();
  const multiPassword = process.env.MULTI_ROOFTOP_SEED_PASSWORD?.trim();

  return {
    ownerEmail,
    ownerPassword,
    ownerName: process.env.OWNER_SEED_NAME?.trim() || 'National Owner',
    ...(multiUsernameRaw && multiPassword
      ? {
          multiRooftopUsername: normalizeApexUsername(multiUsernameRaw),
          multiRooftopPassword: multiPassword,
          multiRooftopName: process.env.MULTI_ROOFTOP_SEED_NAME?.trim() || 'Multi-Rooftop Technician',
        }
      : {}),
  };
}

export interface ApexOwnerSeedResult {
  ownerEmail: string;
  ownerId: string;
  multiRooftopUsername?: string;
  multiRooftopId?: string;
  rooftopIds: string[];
}

export async function seedApexOwnerAccounts(config: ApexOwnerSeedConfig): Promise<ApexOwnerSeedResult> {
  await prisma.dealership.upsert({
    where: { id: APEX_NATIONAL_DEALERSHIP_ID },
    update: { name: APEX_NATIONAL_DEALERSHIP_NAME },
    create: { id: APEX_NATIONAL_DEALERSHIP_ID, name: APEX_NATIONAL_DEALERSHIP_NAME },
  });

  const primaryDealership = await prisma.dealership.findUnique({ where: { id: 'seed-dealership' } });
  if (!primaryDealership) {
    throw new Error('seed-dealership must exist — run Merlinus seed first (npm run db:seed)');
  }

  const secondDealership = await prisma.dealership.upsert({
    where: { id: APEX_SEED_SECOND_DEALERSHIP_ID },
    update: { name: 'Mercedes-Benz of Newport (Seed)' },
    create: {
      id: APEX_SEED_SECOND_DEALERSHIP_ID,
      name: 'Mercedes-Benz of Newport (Seed)',
    },
  });

  const ownerPasswordHash = await bcrypt.hash(config.ownerPassword, 12);

  const owner = await prisma.technician.upsert({
    where: { email: config.ownerEmail },
    update: {
      name: config.ownerName,
      passwordHash: ownerPasswordHash,
      role: 'owner',
      isAdmin: true,
      isActive: true,
      deletedAt: null,
      d7Number: null,
      apexUsername: null,
      dealershipId: APEX_NATIONAL_DEALERSHIP_ID,
      dealerId: null,
      ...seedCompliance,
    },
    create: {
      email: config.ownerEmail,
      name: config.ownerName,
      passwordHash: ownerPasswordHash,
      role: 'owner',
      isAdmin: true,
      isActive: true,
      d7Number: null,
      apexUsername: null,
      dealershipId: APEX_NATIONAL_DEALERSHIP_ID,
      dealerId: null,
      ...seedCompliance,
    },
  });

  let multiRooftopId: string | undefined;
  let multiRooftopUsername: string | undefined;

  if (config.multiRooftopUsername && config.multiRooftopPassword) {
    multiRooftopUsername = config.multiRooftopUsername;
    const multiEmail = `multi-rooftop+${config.multiRooftopUsername}@apex.seed.local`;
    const multiHash = await bcrypt.hash(config.multiRooftopPassword, 12);

    const multi = await prisma.technician.upsert({
      where: { apexUsername: config.multiRooftopUsername },
      update: {
        email: multiEmail,
        name: config.multiRooftopName ?? 'Multi-Rooftop Technician',
        passwordHash: multiHash,
        role: 'technician',
        isAdmin: false,
        isActive: true,
        deletedAt: null,
        d7Number: null,
        dealershipId: primaryDealership.id,
        ...seedCompliance,
      },
      create: {
        email: multiEmail,
        apexUsername: config.multiRooftopUsername,
        name: config.multiRooftopName ?? 'Multi-Rooftop Technician',
        passwordHash: multiHash,
        role: 'technician',
        isAdmin: false,
        isActive: true,
        d7Number: null,
        dealershipId: primaryDealership.id,
        ...seedCompliance,
      },
    });
    multiRooftopId = multi.id;

    await upsertTechnicianDealershipMembership({
      technicianId: multi.id,
      dealershipId: primaryDealership.id,
      role: 'technician',
      isPrimary: true,
      isActive: true,
    });
    await upsertTechnicianDealershipMembership({
      technicianId: multi.id,
      dealershipId: secondDealership.id,
      role: 'technician',
      isPrimary: false,
      isActive: true,
    });
  }

  return {
    ownerEmail: config.ownerEmail,
    ownerId: owner.id,
    multiRooftopUsername,
    multiRooftopId,
    rooftopIds: [primaryDealership.id, secondDealership.id],
  };
}

/** Idempotent apex owner seed — no-op when OWNER_SEED_* env vars are unset (Merlinus default). */
export async function runApexOwnerSeedIfConfigured(): Promise<ApexOwnerSeedResult | null> {
  const config = readApexOwnerSeedConfig();
  if (!config) return null;
  return seedApexOwnerAccounts(config);
}