import { createLightspeedClient } from '../src/services/lightspeed.js';
import fs from 'fs';

async function debug() {
  const client = await createLightspeedClient();
  const sku = '14464';
  
  console.log(`Searching for SKU: ${sku}...`);
  const searchRes = await client.get('/products', {
    params: {
      sku: sku,
      embed: 'inventory,images'
    }
  });

  const product = searchRes.data.data[0];
  if (!product) {
    console.error('Product not found!');
    return;
  }

  console.log('Product Found:', product.id);
  console.log('Inventory:', JSON.stringify(product.inventory, null, 2));
  console.log('Images:', JSON.stringify(product.images, null, 2));

  fs.writeFileSync('scratch/14464_raw.json', JSON.stringify(product, null, 2));
  console.log('Saved to scratch/14464_raw.json');
}

debug().catch(console.error);
