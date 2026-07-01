import bcrypt from 'bcryptjs';
import { CONSENT_VERSION, LEGAL_DISCLAIMER_VERSION } from '@/types';
import { internalEmailForD7, normalizeD7Number } from './d7Number';
import { prisma } from './db';
import { seedTemplateLibraryIfEmpty } from './templateLibrary';

/** Canonical seed credentials — login works immediately after db:seed or deploy auto-seed. */
export const PRIMARY_MANAGER_D7 = 'D7HARRIH';
export const PRIMARY_TECH_D7 = 'D7TECH001';
export const CANONICAL_SEED_PASSWORD = 'Oceanic1735!';

/** @deprecated Use CANONICAL_SEED_PASSWORD */
export const DOCUMENTED_DEV_SEED_PASSWORD = CANONICAL_SEED_PASSWORD;

const seedOnboarding = {
  consentAt: new Date(),
  consentVersion: CONSENT_VERSION,
  legalDisclaimerAt: new Date(),
  legalDisclaimerVersion: LEGAL_DISCLAIMER_VERSION,
};

interface SeedAccountInput {
  d7Number: string;
  legacyEmail: string;
  name: string;
  passwordHash: string;
  role: 'manager' | 'technician';
  isAdmin: boolean;
  dealershipId: string;
}

async function retireTechnician(id: string): Promise<void> {
  await prisma.technician.update({
    where: { id },
    data: {
      isActive: false,
      deletedAt: new Date(),
      sessionVersion: { increment: 1 },
    },
  });
}

function pickPrimaryCandidate(
  candidates: Array<{ id: string; d7Number: string; email: string; createdAt: Date }>,
  d7: string,
  canonicalEmail: string,
  legacyEmail: string
) {
  const byD7 = candidates.find((c) => c.d7Number === d7);
  if (byD7) return byD7;

  const byCanonicalEmail = candidates.find((c) => c.email === canonicalEmail);
  if (byCanonicalEmail) return byCanonicalEmail;

  const normalizedLegacyEmail = legacyEmail.toLowerCase();
  const byLegacyEmail = candidates.find((c) => c.email === normalizedLegacyEmail);
  if (byLegacyEmail) return byLegacyEmail;

  if (candidates.length === 1) return candidates[0];

  return [...candidates].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null;
}

/**
 * Ensure a single canonical D7 account exists — merges legacy email / migration-derived D7 rows.
 */
async function ensureCanonicalSeedAccount(input: SeedAccountInput): Promise<void> {
  const d7 = normalizeD7Number(input.d7Number);
  const canonicalEmail = internalEmailForD7(d7);
  const legacyEmail = input.legacyEmail.toLowerCase();

  const selectFields = { id: true, d7Number: true, email: true, createdAt: true } as const;

  let candidates = await prisma.technician.findMany({
    where: {
      OR: [{ d7Number: d7 }, { email: canonicalEmail }, { email: legacyEmail }],
    },
    select: selectFields,
  });

  if (candidates.length === 0) {
    candidates = await prisma.technician.findMany({
      where: {
        dealershipId: input.dealershipId,
        role: input.role,
        isActive: true,
        deletedAt: null,
      },
      select: selectFields,
    });
  }

  const accountData = {
    d7Number: d7,
    email: canonicalEmail,
    name: input.name,
    passwordHash: input.passwordHash,
    role: input.role,
    isAdmin: input.isAdmin,
    isActive: true,
    deletedAt: null,
    dealershipId: input.dealershipId,
    ...seedOnboarding,
  };

  const primary = pickPrimaryCandidate(candidates, d7, canonicalEmail, legacyEmail);

  if (primary) {
    const d7Holder = await prisma.technician.findUnique({ where: { d7Number: d7 } });
    if (d7Holder && d7Holder.id !== primary.id) {
      await retireTechnician(d7Holder.id);
    }

    await prisma.technician.update({
      where: { id: primary.id },
      data: accountData,
    });

    for (const duplicate of candidates) {
      if (duplicate.id !== primary.id) {
        await retireTechnician(duplicate.id);
      }
    }
    return;
  }

  const created = await prisma.technician.upsert({
    where: { d7Number: d7 },
    update: accountData,
    create: accountData,
  });

  for (const duplicate of candidates) {
    if (duplicate.id !== created.id) {
      await retireTechnician(duplicate.id);
    }
  }
}

export interface SeedResult {
  managerD7: string;
  techD7: string;
  templates: number;
  knowledgeBase: number;
}

export async function runDatabaseSeed(): Promise<SeedResult> {
  const managerD7 = normalizeD7Number(process.env.ADMIN_SEED_D7?.trim() || PRIMARY_MANAGER_D7);
  const techD7 = normalizeD7Number(process.env.TECH_SEED_D7?.trim() || PRIMARY_TECH_D7);
  const passwordHash = await bcrypt.hash(CANONICAL_SEED_PASSWORD, 12);

  const dealership = await prisma.dealership.upsert({
    where: { id: 'seed-dealership' },
    update: { name: 'Mercedes-Benz of Tiverton' },
    create: {
      id: 'seed-dealership',
      name: 'Mercedes-Benz of Tiverton',
    },
  });

  const legacyManagerEmail = (process.env.ADMIN_SEED_EMAIL?.trim() || 'admin@dealership.com').toLowerCase();
  const legacyTechEmail = (process.env.TECH_SEED_EMAIL?.trim() || 'tech@dealership.com').toLowerCase();

  await ensureCanonicalSeedAccount({
    d7Number: managerD7,
    legacyEmail: legacyManagerEmail,
    name: 'Service Manager',
    passwordHash,
    role: 'manager',
    isAdmin: true,
    dealershipId: dealership.id,
  });

  await ensureCanonicalSeedAccount({
    d7Number: techD7,
    legacyEmail: legacyTechEmail,
    name: 'Alex Technician',
    passwordHash,
    role: 'technician',
    isAdmin: false,
    dealershipId: dealership.id,
  });

  const library = await seedTemplateLibraryIfEmpty();

  return {
    managerD7,
    techD7,
    templates: library.templates,
    knowledgeBase: library.knowledgeBase,
  };
}