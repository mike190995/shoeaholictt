import { prisma } from '../src/lib/prisma.js';
import { createLightspeedClient } from '../src/services/lightspeed.js';

async function testDetail() {
  const ls = await createLightspeedClient();
  
  const childSkus = ['14343']; // Khaki / 36

  for (const sku of childSkus) {
    console.log("Fetching SKU:", sku);
    
    const res = await ls.get('/search', {
      params: { type: 'products', sku: sku, embed: 'images' }
    });
    
    const data = res.data.data?.[0];
    if (data) {
       console.log("== KHAKI RAW ==");
       console.log("Name:", data.name);
       console.log("Variant name:", data.variant_name);
       console.log("Images array length:", data.images?.length);
       console.log("SKU Images array:", JSON.stringify(data.skuImages, null, 2));
    }
  }

  await prisma.$disconnect();
}


testDetail().catch(console.error);
