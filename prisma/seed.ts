import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log('Seeding local database...');

  // Only seed initial default credentials if none exist, preventing clobbering user configurations
  const existing = await prisma.credential.findUnique({
    where: { platform: 'lightspeed' },
  });

  if (!existing) {
    await prisma.credential.create({
      data: {
        platform: 'lightspeed',
        accessToken: 'lsxs_pt_76bc256d0d21096a67fdbf4e414c2438c8be373d',
        refreshToken: null,
        expiresAt: null,
        accountId: 'shoptt.retail.lightspeed.app',
      },
    });
    console.log('Lightspeed credentials seeded (initial default).');
  } else {
    console.log('Lightspeed credentials already exist. Skipping seed to prevent overwriting user configurations.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
