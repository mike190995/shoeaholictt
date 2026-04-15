
import pg from 'pg';
import axios from 'axios';
const { Client } = pg;

const connectionString = "postgresql://lswoo_user:C2AcjdSymxMGZB10rXHlDReJ!@127.0.0.1:5433/shoeaholic_cmw";

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('--- Checking Credentials ---');
  const credsRes = await client.query('SELECT platform, account_id, access_token FROM credentials WHERE platform = \'lightspeed\'');
  const credential = credsRes.rows[0];
  console.log(JSON.stringify(credential, null, 2));

  if (credential) {
    const baseURL = credential.account_id.includes('.') 
      ? `https://${credential.account_id}/api/2.0` 
      : `https://${credential.account_id}.vendhq.com/api/2.0`;
    
    console.log(`\n--- Testing Lightspeed API: ${baseURL}/products ---`);
    try {
      const response = await axios.get(`${baseURL}/search`, {
        headers: {
          'Authorization': `Bearer ${credential.access_token}`,
          'Content-Type': 'application/json'
        },
        params: { type: 'products', sku: '14362', embed: 'inventory' }
      });
      console.log('Success! Status:', response.status);
      
      if (response.data.data?.length > 0) {
        const p = response.data.data[0];
        console.log('--- Targeted Product Data (14362) ---');
        console.log(JSON.stringify({
           sku: p.sku,
           name: p.name,
           inventory: p.inventory,
           images: p.images
        }, null, 2));
      } else {
        console.log('SKU 11139 not found. Listing first 5 items with inventory:');
        const listRes = await axios.get(`${baseURL}/products`, {
          headers: { 'Authorization': `Bearer ${credential.access_token}` },
          params: { page_size: 5, embed: 'inventory' }
        });
        listRes.data.data.forEach((p: any) => {
          console.log(`- ${p.sku}: inventory count = ${p.inventory?.length || 0}`);
        });
      }

      if (response.data.data?.length > 0) {
        console.log('--- Sample Product Data (11139) ---');
        console.log(JSON.stringify(response.data.data[0], null, 2));
      }
      if (response.data.data?.length > 0) {
        console.log('--- Sample Product Data ---');
        console.log(JSON.stringify(response.data.data[0], null, 2));
      }
    } catch (err: any) {
      console.error('Failed! Error:', err.message);
      if (err.response) {
        console.error('Response Data:', JSON.stringify(err.response.data, null, 2));
        console.error('Response Status:', err.response.status);
      }
    }
  }

  await client.end();
}

main().catch(console.error);
