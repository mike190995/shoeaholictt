import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding local database...');

  await prisma.product.upsert({
    where: { sku: 'SHOE-001' },
    update: {},
    create: {
      sku: 'SHOE-001',
      title: 'Nike Air Max 2026',
      price: 150.00,
      quantity: 10,
      category: 'Sneakers',
      lightspeedId: 'ls_101',
      woocommerceId: 201,
      metadata: { color: 'Red', size: '10' }
    }
  });

  await prisma.product.upsert({
    where: { sku: 'SHOE-002' },
    update: {},
    create: {
      sku: 'SHOE-002',
      title: 'Adidas Ultraboost Pro',
      price: 180.00,
      quantity: 5,
      category: 'Sneakers',
      lightspeedId: 'ls_102',
      woocommerceId: 202,
      metadata: { color: 'Black', size: '11' }
    }
  });

  console.log('Seed complete! 🚀');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
