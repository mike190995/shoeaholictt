
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkTiffanies() {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { title: { contains: 'TIFFANY', mode: 'insensitive' } },
        { sku: { contains: '14362' } }
      ]
    },
    take: 5
  });

  console.log(`Found ${products.length} matching products.`);
  products.forEach(p => {
    console.log(`- SKU: ${p.sku}`);
    console.log(`  Title: ${p.title}`);
    console.log(`  Price: ${p.price}`);
    console.log(`  Stock: ${p.quantity}`);
    console.log(`  ImageUrl: ${p.imageUrl}`);
    console.log(`  Metadata: ${JSON.stringify(p.metadata)}`);
    console.log('---');
  });
}

checkTiffanies().finally(() => prisma.$disconnect());
