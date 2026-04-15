const axios = require('axios');
const fs = require('fs');

async function debug() {
  // Use the credentials from .env but I'll hardcode the account for 1 sec
  const client = axios.create({
    baseURL: 'https://shoptt.retail.lightspeed.app/api/2.0',
    headers: {
      'Authorization': 'Bearer lsxs_pt_76bc256d0d21096a67fdbf4e414c2438c8be373d', // I'll use the token from .env if I can read it
      'Content-Type': 'application/json'
    }
  });

  try {
    const res = await client.get('/products', { params: { sku: '14464', embed: 'inventory,images' } });
    fs.writeFileSync('scratch/14464_full.json', JSON.stringify(res.data, null, 2));
    console.log('Success - saved to scratch/14464_full.json');
  } catch (e) {
    console.error('Failed:', e.response?.data || e.message);
  }
}
debug();
