import { prisma } from '../src/lib/prisma.js';
import { createLightspeedClient } from '../src/services/lightspeed.js';

async function testLsSearch() {
  const lsClient = await createLightspeedClient(prisma);
  const sku = '14342';
  
  console.log(`[LS Search Test] Searching for SKU: ${sku} via /search endpoint`);
  try {
    // Note: Vend Search API documentation often suggests /search
    const res = await lsClient.get('/search', { params: { type: 'products', sku: sku } });
    const data = res.data.data;
    
    console.log(`Total items returned: ${data?.length || 0}`);
    if (data && data.length > 0) {
      console.log(`Found item: ID=${data[0].id}, SKU=${data[0].sku}, Name="${data[0].name}"`);
      if (data[0].name === 'Discount') {
        console.warn('!!! WARNING: Still getting Discount product. Search endpoint might be failing or misused.');
      } else {
        console.log('SUCCESS: Found the actual product!');
      }
    } else {
      console.log('No items found.');
    }
  } catch (err: any) {
    console.error('Error:', err.response?.data || err.message);
  } finally {
    await prisma.$disconnect();
  }
}

testLsSearch();
