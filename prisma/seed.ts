import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const MANAGER_PASSWORD = 'REDACTED_USE_ADMIN_SEED_PASSWORD_ENV';
const TECH_PASSWORD = 'changeme123';

async function main() {
  const dealership = await prisma.dealership.upsert({
    where: { id: 'seed-dealership' },
    update: {},
    create: {
      id: 'seed-dealership',
      name: 'Mercedes-Benz of Demo City',
    },
  });

  const managerPasswordHash = await bcrypt.hash(MANAGER_PASSWORD, 12);
  const techPasswordHash = await bcrypt.hash(TECH_PASSWORD, 12);

  await prisma.technician.upsert({
    where: { email: 'admin@dealership.com' },
    update: { passwordHash: managerPasswordHash },
    create: {
      email: 'admin@dealership.com',
      name: 'Service Manager',
      passwordHash: managerPasswordHash,
      role: 'manager',
      isActive: true,
      dealershipId: dealership.id,
      consentAt: new Date(),
      consentVersion: '2026-06-07-v1',
    },
  });

  await prisma.technician.upsert({
    where: { email: 'tech@dealership.com' },
    update: {},
    create: {
      email: 'tech@dealership.com',
      name: 'Alex Technician',
      passwordHash: techPasswordHash,
      role: 'technician',
      isActive: true,
      dealershipId: dealership.id,
      consentAt: new Date(),
      consentVersion: '2026-06-07-v1',
    },
  });

  console.log('Seed complete.');
  console.log('  admin@dealership.com (manager) — password updated');
  console.log('  tech@dealership.com / changeme123 (technician)');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());