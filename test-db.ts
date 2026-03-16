import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://lswoo_user:u1W%26B%256U%2F%269@35.231.144.240:5432/lswoo_db',
    },
  },
});

async function main() {
  try {
    const count = await prisma.product.count();
    console.log(`Connected to GCP! Product count: ${count}`);
  } catch (err) {
    console.error('Failed to connect:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
