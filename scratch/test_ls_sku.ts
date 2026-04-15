import { prisma } from '../src/lib/prisma.js';
import { createLightspeedClient } from '../src/services/lightspeed.js';

async function testLsSkuLookup() {
  const lsClient = await createLightspeedClient(prisma);
  const sku = '14342';
  
  console.log(`[LS Test] Searching for SKU: ${sku}`);
  try {
    const res = await lsClient.get('/products', { params: { sku } });
    const data = res.data.data;
    
    console.log(`Total items returned: ${data.length}`);
    if (data.length > 0) {
      console.log(`First item returned: ID=${data[0].id}, SKU=${data[0].sku}, Name="${data[0].name}"`);
    }

    const res2 = await lsClient.get('/products', { params: { handle: sku } });
    const data2 = res2.data.data;
    console.log(`\nWhat if we use handle? Items: ${data2.length}`);
    if (data2.length > 0) {
      console.log(`First item (handle): ID=${data2[0].id}, SKU=${data2[0].sku}, Name="${data2[0].name}"`);
    }
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

testLsSkuLookup();
