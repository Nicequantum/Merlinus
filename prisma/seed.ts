import { PrismaClient } from '@prisma/client';
import { CANONICAL_SEED_PASSWORD, runDatabaseSeed } from '../src/lib/seedDatabase';

const prisma = new PrismaClient();

async function main() {
  const result = await runDatabaseSeed();
  console.log(`  Template library: ${result.templates} templates, ${result.knowledgeBase} knowledge-base entries`);
  console.log('Seed complete.');
  console.log(`  Primary login: ${result.managerD7} (service manager) / ${CANONICAL_SEED_PASSWORD}`);
  console.log(`  Technician login: ${result.techD7} / ${CANONICAL_SEED_PASSWORD}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());