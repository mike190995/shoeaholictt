import { createLightspeedClient } from '../src/services/lightspeed.js';

async function deepDebug() {
  const sku = '14342';
  const client = await createLightspeedClient();

  console.log(`--- Deep Debug SKU: ${sku} ---`);
  
  // 1. Search for the product
  const searchResp = await client.get('/search', { params: { type: 'products', sku, embed: 'inventory,images' } });
  const product = searchResp.data.data?.[0];
  
  if (!product) {
    console.log('Product not found in search');
    return;
  }

  console.log('Product JSON:', JSON.stringify(product, null, 2));

  // 2. If it has a parent, check the parent
  if (product.variant_parent_id) {
    console.log(`Checking parent: ${product.variant_parent_id}`);
    const parentResp = await client.get(`/products/${product.variant_parent_id}`, { params: { embed: 'images' } });
    console.log('Parent JSON:', JSON.stringify(parentResp.data.data, null, 2));
  } else {
    console.log('No variant_parent_id found');
  }

  // 3. Just for sanity, check ALL products with this handle if it exists
  if (product.handle) {
    console.log(`Checking products with handle: ${product.handle}`);
    const handleResp = await client.get('/products', { params: { handle: product.handle, embed: 'images' } });
    console.log('Handle results count:', handleResp.data.data?.length);
    handleResp.data.data?.forEach((p: any) => {
      console.log(`- Product ${p.sku}: images count ${p.images?.length}, image_url: ${p.image_url}`);
    });
  }
}

deepDebug().catch(console.error);
