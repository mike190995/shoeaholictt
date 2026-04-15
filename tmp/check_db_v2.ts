
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Checking Credentials ---');
  const credentials = await prisma.credential.findMany();
  console.log(JSON.stringify(credentials, null, 2));

  console.log('\n--- Checking Recent Sync Logs ---');
  const logs = await prisma.syncLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log(JSON.stringify(logs, null, 2));

  console.log('\n--- Checking Product Count ---');
  const count = await prisma.product.count();
  console.log(`Total Products: ${count}`);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
