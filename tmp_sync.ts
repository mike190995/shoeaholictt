import 'dotenv/config';
import { createLightspeedClient } from './src/services/lightspeed.js';
import { createWooCommerceClient, createWooProduct, updateWooProduct, getWooProductBySku } from './src/services/woocommerce.js';
import { UniversalProduct } from './src/mappers/universal.js';

async function main() {
  try {
    const lsClient = await createLightspeedClient();
    
    // Search Lightspeed for 14243
    console.log('Searching Lightspeed for 14243...');
    let res = await lsClient.get('/products', { params: { sku: '14243' } });
    let items = res.data.data;
    
    if (!items || items.length === 0) {
      console.log('Not found by SKU. Searching by ID...');
      try {
        res = await lsClient.get('/products/14243');
        if (res.data.data) {
          items = [res.data.data];
        }
      } catch (err) {
        console.log('Not found by ID. Searching /search...');
        res = await lsClient.get('/search', { params: { type: 'products', sku: '14243' } });
        items = res.data.data;
      }
    }

    if (!items || items.length === 0) {
      console.log('Could not find item 14243 in Lightspeed.');
      return;
    }

    const lsItem = items[0];
    console.log('Found in Lightspeed:', lsItem.name || lsItem.title, '| SKU:', lsItem.sku, '| ID:', lsItem.id);

    // Convert to Universal & Woo
    const universal = UniversalProduct.fromLightspeed(lsItem);
    const wooPayload = universal.toWoo();
    
    console.log('WooCommerce Payload generated.');
    
    const wooClient = createWooCommerceClient();
    
    console.log('Checking if it exists in WooCommerce by SKU...');
    const existingWoo = await getWooProductBySku(wooClient, universal.data.sku);
    
    if (existingWoo) {
      console.log('Found in Woo (ID:', existingWoo.id, '). Updating...');
      await updateWooProduct(wooClient, Number(existingWoo.id), wooPayload);
      console.log('Successfully updated in WooCommerce.');
    } else {
      console.log('Not found in Woo. Creating...');
      const newId = await createWooProduct(wooClient, wooPayload);
      console.log('Successfully created in WooCommerce with ID:', newId);
    }
  } catch (err: any) {
    console.error('Error:', err.message);
    if (err.response?.data) {
      console.error('Response details:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

main();
