import { createLightspeedClient } from '../src/services/lightspeed.js';

async function debugSkus() {
  const skus = ['14342', '14464', '2000000056951.0', '2000000054223.0'];
  const client = await createLightspeedClient();

  for (const sku of skus) {
    console.log(`--- SKU: ${sku} ---`);
    try {
      // Try search first with SKU
      const searchResp = await client.get('/search', { params: { type: 'products', sku, embed: 'inventory,images' } });
      const searchProduct = searchResp.data.data?.[0];
      
      if (!searchProduct) {
        // Try direct products fetch
        const resp = await client.get('/products', { params: { sku, embed: 'inventory,images' } });
        const product = resp.data.data?.[0];
        console.log(JSON.stringify(product || { error: 'Not found' }, null, 2));
      } else {
        console.log(JSON.stringify(searchProduct, null, 2));
      }
    } catch (err: any) {
      console.error(`Error fetching ${sku}: ${err.message}`);
    }
  }
}

debugSkus().catch(console.error);
