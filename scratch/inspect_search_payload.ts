import { prisma } from '../src/lib/prisma.js';
import { createLightspeedClient } from '../src/services/lightspeed.js';

async function testDetail() {
  const ls = await createLightspeedClient();
  const sku = '14342';
  console.log(`[Diagnostic] Searching for SKU: ${sku}...`);
  
  const res = await ls.get('/search', {
    params: { 
      type: 'products', 
      sku: sku,
      embed: 'images,inventory'
    }
  });

  const product = res.data.data?.[0];
  if (!product) {
    console.log('No product found.');
    return;
  }

  console.log('--- PRODUCT CORE ---');
  console.log('Name:', product.name);
  console.log('Variant Name:', product.variant_name);
  console.log('Retail Price:', product.retail_price);
  
  console.log('\n--- IMAGES ---');
  console.log('image_url:', product.image_url);
  console.log('images_count:', product.images?.length || 0);
  if (product.images && product.images.length > 0) {
    console.log('First image sample:', JSON.stringify(product.images[0], null, 2));
  }

  console.log('\n--- INVENTORY ---');
  console.log('inventory_level (summary):', product.inventory_level);
  console.log('inventory array length:', product.inventory?.length || 0);
  if (product.inventory && product.inventory.length > 0) {
    console.log('First inventory sample:', JSON.stringify(product.inventory[0], null, 2));
  }
  
  await prisma.$disconnect();
}

testDetail().catch(console.error);
