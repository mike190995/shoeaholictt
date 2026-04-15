import { prisma } from '../src/lib/prisma.js';
import { createLightspeedClient } from '../src/services/lightspeed.js';

async function debug() {
  try {
    const lsClient = await createLightspeedClient();
    const search = '14458';
    const active = '1';
    
    console.log(`Searching for SKU: ${search} with active=${active}`);
    
    // Test 1: /products?sku=14458
    const skuParams: any = { page_size: 50, sku: search, embed: 'inventory' };
    if (active !== undefined) skuParams.active = active;
    
    console.log('Testing /products?sku=14458');
    const res1 = await lsClient.get('/products', { params: skuParams });
    console.log('Res1 Data Length:', res1.data.data?.length || 0);
    console.log('Res1 Data:', JSON.stringify(res1.data.data, null, 2));

    // Test 2: /search?sku=14458
    const searchParams: any = { type: 'products', page_size: 50, embed: 'inventory', sku: search };
    if (active !== undefined) searchParams.active = active;
    
    console.log('Testing /search?sku=14458');
    const res2 = await lsClient.get('/search', { params: searchParams });
    console.log('Res2 Data Length:', res2.data.data?.length || 0);
    
    // Test 3: /products?name=... (fuzzy)
    console.log('Testing /products?sku=... (broad)');
    const res3 = await lsClient.get('/products', { params: { sku: search } });
    console.log('Res3 Data Length:', res3.data.data?.length || 0);

  } catch (err: any) {
    console.error('Error:', err.response?.data || err.message);
  } finally {
    await prisma.$disconnect();
  }
}

debug();
