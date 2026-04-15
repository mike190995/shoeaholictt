import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkDb() {
  try {
    const cred = await prisma.credential.findUnique({ where: { platform: 'lightspeed' } });
    console.log('--- Lightspeed Credential ---');
    if (cred) {
      console.log('Account ID:', cred.accountId);
      console.log('Access Token (masked):', cred.accessToken ? cred.accessToken.substring(0, 10) + '...' : 'null');
      console.log('Refresh Token (masked):', cred.refreshToken ? cred.refreshToken.substring(0, 10) + '...' : 'null');
      console.log('Expires At:', cred.expiresAt);
    } else {
      console.log('No Lightspeed credential found.');
    }

    const productCount = await prisma.product.count();
    console.log('\n--- Local Product Count ---');
    console.log('Count:', productCount);

    const products = await prisma.product.findMany({ take: 5 });
    console.log('\n--- Sample Local Products ---');
    console.log(JSON.stringify(products, null, 2));

  } catch (err: any) {
    console.error('Database Check Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDb();
