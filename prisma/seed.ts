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
  if (result.ownerEmails?.length) {
    for (const email of result.ownerEmails) {
      console.log(`  Owner login: ${email} — password from OWNER_SEED_PASSWORD / OWNER_SEED_PASSWORD_2`);
    }
  } else if (result.ownerEmail) {
    console.log(`  Owner login: ${result.ownerEmail} — password from OWNER_SEED_PASSWORD`);
  }
  if (result.multiRooftopUsername) {
    console.log(
      `  Multi-rooftop login: ${result.multiRooftopUsername} — password from MULTI_ROOFTOP_SEED_PASSWORD`
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());