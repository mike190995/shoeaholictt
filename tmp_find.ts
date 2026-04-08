import { prisma } from './src/lib/prisma.js';

async function main() {
  const p = await prisma.product.findUnique({
    where: { sku: '033616494222' }
  });
  console.log(JSON.stringify(p, null, 2));
}

main().catch(console.error);
