import { PrismaClient } from '@prisma/client';
import { runDatabaseSeed } from '../src/lib/seedDatabase';

const prisma = new PrismaClient();

async function main() {
  const result = await runDatabaseSeed();
  console.log(`  Template library: ${result.templates} templates, ${result.knowledgeBase} knowledge-base entries`);
  console.log('Seed complete.');
  console.log(`  Primary login: ${result.managerD7} (service manager)`);
  console.log(`  Technician login: ${result.techD7}`);
  console.log('  First-login password rotation enforced — use ADMIN_SEED_PASSWORD / TECH_SEED_PASSWORD from .env.local');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());