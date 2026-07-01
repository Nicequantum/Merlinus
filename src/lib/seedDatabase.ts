import bcrypt from 'bcryptjs';
import { CONSENT_VERSION, LEGAL_DISCLAIMER_VERSION } from '@/types';
import { internalEmailForD7 } from './d7Number';
import { prisma } from './db';
import { seedTemplateLibraryIfEmpty } from './templateLibrary';

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

/**
 * Upsert the canonical D7 account and retire legacy email duplicates without D7 unique collisions.
 */
async function upsertSeedAccount(input: SeedAccountInput): Promise<void> {
  const canonicalEmail = internalEmailForD7(input.d7Number);

  const account = await prisma.technician.upsert({
    where: { d7Number: input.d7Number },
    update: {
      email: canonicalEmail,
      name: input.name,
      passwordHash: input.passwordHash,
      role: input.role,
      isAdmin: input.isAdmin,
      isActive: true,
      deletedAt: null,
      dealershipId: input.dealershipId,
      ...seedOnboarding,
    },
    create: {
      d7Number: input.d7Number,
      email: canonicalEmail,
      name: input.name,
      passwordHash: input.passwordHash,
      role: input.role,
      isAdmin: input.isAdmin,
      isActive: true,
      dealershipId: input.dealershipId,
      ...seedOnboarding,
    },
  });

  const legacyDuplicate = await prisma.technician.findFirst({
    where: {
      email: input.legacyEmail,
      id: { not: account.id },
    },
  });

  if (legacyDuplicate) {
    await prisma.technician.update({
      where: { id: legacyDuplicate.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });
  }
}

function requireEnv(name: string, minLength = 1): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < minLength) {
    throw new Error(
      `${name} must be set${minLength > 1 ? ` (min ${minLength} characters)` : ''} before running db:seed.`
    );
  }
  return value;
}

export interface SeedResult {
  managerD7: string;
  techD7: string;
  templates: number;
  knowledgeBase: number;
}

export async function runDatabaseSeed(): Promise<SeedResult> {
  const managerD7 = (process.env.ADMIN_SEED_D7?.trim() || 'D7HARRIH').toUpperCase();
  const techD7 = (process.env.TECH_SEED_D7?.trim() || 'D7TECH001').toUpperCase();
  const managerPassword = requireEnv('ADMIN_SEED_PASSWORD', 8);
  const techPassword = requireEnv('TECH_SEED_PASSWORD', 8);

  const dealership = await prisma.dealership.upsert({
    where: { id: 'seed-dealership' },
    update: { name: 'Mercedes-Benz of Tiverton' },
    create: {
      id: 'seed-dealership',
      name: 'Mercedes-Benz of Tiverton',
    },
  });

  const managerPasswordHash = await bcrypt.hash(managerPassword, 12);
  const techPasswordHash = await bcrypt.hash(techPassword, 12);

  const legacyManagerEmail = (process.env.ADMIN_SEED_EMAIL?.trim() || 'admin@dealership.com').toLowerCase();
  const legacyTechEmail = (process.env.TECH_SEED_EMAIL?.trim() || 'tech@dealership.com').toLowerCase();

  await upsertSeedAccount({
    d7Number: managerD7,
    legacyEmail: legacyManagerEmail,
    name: 'Service Manager',
    passwordHash: managerPasswordHash,
    role: 'manager',
    isAdmin: true,
    dealershipId: dealership.id,
  });

  await upsertSeedAccount({
    d7Number: techD7,
    legacyEmail: legacyTechEmail,
    name: 'Alex Technician',
    passwordHash: techPasswordHash,
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