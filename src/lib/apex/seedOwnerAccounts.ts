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
import { logger } from '@/lib/logger';

/** Second rooftop for multi-dealership selector demos and integration tests. */
export const APEX_SEED_SECOND_DEALERSHIP_ID = 'seed-dealership-2';

const seedCompliance = {
  consentAt: new Date(),
  consentVersion: CONSENT_VERSION,
  legalDisclaimerAt: new Date(),
  legalDisclaimerVersion: LEGAL_DISCLAIMER_VERSION,
};

export interface ApexOwnerAccountSeed {
  email: string;
  password: string;
  name: string;
}

export interface ApexOwnerSeedConfig {
  /** One or more national owner accounts (email login only). */
  owners: ApexOwnerAccountSeed[];
  multiRooftopUsername?: string;
  multiRooftopPassword?: string;
  multiRooftopName?: string;
}

/** Strip optional wrapping quotes from dotenv values (Windows shells sometimes re-quote). */
function stripEnvQuotes(value: string | undefined): string {
  let v = value?.trim() ?? '';
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

/**
 * Platform national operators. Passwords come from env first; non-production falls back
 * to the known local operator passwords so Apex owner login works after seed.
 */
const PLATFORM_OWNER_SPECS = [
  {
    email: 'hombre3536@gmail.com',
    name: 'Hombre Owner',
    passwordEnv: 'OWNER_SEED_PASSWORD',
    /** Dev/staging only — production must set OWNER_SEED_PASSWORD. */
    devPassword: 'Bressette1735',
  },
  {
    email: 'scollier@getfused.com',
    name: 'S. Collier',
    passwordEnv: 'OWNER_SEED_PASSWORD_2',
    devPassword: 'Getfused123',
  },
] as const;

function pushOwnerIfConfigured(
  owners: ApexOwnerAccountSeed[],
  emailRaw: string | undefined,
  passwordRaw: string | undefined,
  nameRaw: string | undefined,
  fallbackName: string
): void {
  const email = stripEnvQuotes(emailRaw).toLowerCase();
  const password = stripEnvQuotes(passwordRaw);
  if (!email || !password) return;
  if (!email.includes('@')) return;
  if (owners.some((o) => o.email === email)) return;
  owners.push({
    email,
    password,
    name: stripEnvQuotes(nameRaw) || fallbackName,
  });
}

/**
 * Read apex owner + optional multi-rooftop seed credentials.
 * Always includes platform operator emails when a password can be resolved.
 */
export function readApexOwnerSeedConfig(): ApexOwnerSeedConfig | null {
  const owners: ApexOwnerAccountSeed[] = [];

  // 1) Built-in platform operators (must work for Apex national login)
  for (const spec of PLATFORM_OWNER_SPECS) {
    const fromEnv = stripEnvQuotes(process.env[spec.passwordEnv]);
    const password = fromEnv || (!isProductionRuntime() ? spec.devPassword : '');
    pushOwnerIfConfigured(owners, spec.email, password, spec.name, spec.name);
  }

  // 2) Optional extra owners via OWNER_SEED_EMAIL / OWNER_SEED_EMAIL_2 (if different emails)
  pushOwnerIfConfigured(
    owners,
    process.env.OWNER_SEED_EMAIL,
    process.env.OWNER_SEED_PASSWORD,
    process.env.OWNER_SEED_NAME,
    'National Owner'
  );
  pushOwnerIfConfigured(
    owners,
    process.env.OWNER_SEED_EMAIL_2,
    process.env.OWNER_SEED_PASSWORD_2,
    process.env.OWNER_SEED_NAME_2,
    'National Owner'
  );

  if (owners.length === 0) return null;

  const multiUsernameRaw = process.env.MULTI_ROOFTOP_SEED_USERNAME?.trim();
  const multiPassword = process.env.MULTI_ROOFTOP_SEED_PASSWORD?.trim();

  return {
    owners,
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
  /** Primary owner email (first seeded) — backward compatible. */
  ownerEmail: string;
  ownerId: string;
  owners: Array<{ email: string; id: string }>;
  multiRooftopUsername?: string;
  multiRooftopId?: string;
  rooftopIds: string[];
}

async function ensureNationalSentinelDealership(): Promise<void> {
  await prisma.dealership.upsert({
    where: { id: APEX_NATIONAL_DEALERSHIP_ID },
    update: { name: APEX_NATIONAL_DEALERSHIP_NAME },
    create: { id: APEX_NATIONAL_DEALERSHIP_ID, name: APEX_NATIONAL_DEALERSHIP_NAME },
  });
}

/** Upsert a single national owner by email (case-insensitive match, normalize to lowercase). */
async function upsertNationalOwnerAccount(account: ApexOwnerAccountSeed) {
  const email = account.email.trim().toLowerCase();
  // Use bcryptjs directly (same library as verifyPassword in auth.ts)
  const passwordHash = await bcrypt.hash(account.password, 12);
  const ownerData = {
    email,
    name: account.name,
    passwordHash,
    role: 'owner' as const,
    isAdmin: true,
    isActive: true,
    deletedAt: null as Date | null,
    d7Number: null as string | null,
    apexUsername: null as string | null,
    dealershipId: APEX_NATIONAL_DEALERSHIP_ID,
    dealerId: null as string | null,
    ...seedCompliance,
  };

  const existing = await prisma.technician.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true },
  });

  if (existing) {
    // Normalize email casing + force owner role + refresh password hash
    return prisma.technician.update({
      where: { id: existing.id },
      data: ownerData,
    });
  }

  return prisma.technician.create({ data: ownerData });
}

export async function seedApexOwnerAccounts(config: ApexOwnerSeedConfig): Promise<ApexOwnerSeedResult> {
  if (!config.owners?.length) {
    throw new Error('seedApexOwnerAccounts requires at least one owner account');
  }

  await ensureNationalSentinelDealership();

  let primaryDealership = await prisma.dealership.findUnique({ where: { id: 'seed-dealership' } });
  if (!primaryDealership) {
    primaryDealership = await prisma.dealership.create({
      data: { id: 'seed-dealership', name: 'Mercedes-Benz of Tiverton' },
    });
  }

  const secondDealership = await prisma.dealership.upsert({
    where: { id: APEX_SEED_SECOND_DEALERSHIP_ID },
    update: { name: 'Mercedes-Benz of Newport (Seed)' },
    create: {
      id: APEX_SEED_SECOND_DEALERSHIP_ID,
      name: 'Mercedes-Benz of Newport (Seed)',
    },
  });

  const seededOwners: Array<{ email: string; id: string }> = [];
  for (const account of config.owners) {
    const owner = await upsertNationalOwnerAccount(account);
    seededOwners.push({ email: owner.email, id: owner.id });
  }

  let multiRooftopId: string | undefined;
  let multiRooftopUsername: string | undefined;

  if (config.multiRooftopUsername && config.multiRooftopPassword) {
    multiRooftopUsername = config.multiRooftopUsername;
    const multiEmail = `multi-rooftop+${config.multiRooftopUsername}@apex.seed.local`;
    const multiHash = await bcrypt.hash(config.multiRooftopPassword, 12);

    await prisma.technician.updateMany({
      where: {
        apexUsername: config.multiRooftopUsername,
        email: { not: multiEmail },
      },
      data: { apexUsername: null, isActive: false, deletedAt: new Date() },
    });

    const multi = await prisma.technician.upsert({
      where: { email: multiEmail },
      update: {
        apexUsername: config.multiRooftopUsername,
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

  const primary = seededOwners[0];
  return {
    ownerEmail: primary.email,
    ownerId: primary.id,
    owners: seededOwners,
    multiRooftopUsername,
    multiRooftopId,
    rooftopIds: [primaryDealership.id, secondDealership.id],
  };
}

/** Idempotent apex owner seed — no-op when no owner passwords can be resolved. */
export async function runApexOwnerSeedIfConfigured(): Promise<ApexOwnerSeedResult | null> {
  const config = readApexOwnerSeedConfig();
  if (!config) return null;
  return seedApexOwnerAccounts(config);
}

/**
 * Ensure platform owners exist with current passwords.
 * Safe to call from instrumentation / login self-heal.
 */
export async function ensureApexPlatformOwners(): Promise<ApexOwnerSeedResult | null> {
  try {
    const result = await runApexOwnerSeedIfConfigured();
    if (result) {
      logger.info('apex.owner_seed_ensured', {
        owners: result.owners.map((o) => o.email),
      });
    }
    return result;
  } catch (error) {
    logger.error('apex.owner_seed_ensure_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
