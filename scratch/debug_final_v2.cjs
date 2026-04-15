const axios = require('axios');
const fs = require('fs');

async function debug() {
  const client = axios.create({
    baseURL: 'https://shoptt.retail.lightspeed.app/api/2.0',
    headers: {
      'Authorization': 'Bearer lsxs_pt_76bc256d0d21096a67fdbf4e414c2438c8be373d', 
      'Content-Type': 'application/json'
    }
  });

  try {
    console.log('Querying SKU 14464 with embed=inventory,images...');
    const res = await client.get('/products', { params: { sku: '14464', embed: 'inventory,images' } });
    const product = res.data.data?.[0];
    
    if (product) {
      console.log('Inventory Array:', JSON.stringify(product.inventory, null, 2));
      console.log('Images Array:', JSON.stringify(product.images, null, 2));
    } else {
      console.log('No product found for SKU 14464');
    }
    
    fs.writeFileSync('scratch/14464_full_debug.json', JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.error('Failed:', e.response?.data || e.message);
  }
}
debug();
