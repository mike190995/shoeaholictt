const API_BASE = 'https://lswoo-middleware-vtgafbdhzq-ue.a.run.app/admin/api';

async function main() {
  const searchTerm = encodeURIComponent('(TIFFANY) JL-11');
  console.log(`Searching Lightspeed for: ${searchTerm}...`);
  let res = await fetch(`${API_BASE}/lightspeed/search?search=${searchTerm}`, {
    method: 'GET'
  });
  const data = await res.json();
  console.log('Search Results:', JSON.stringify(data, null, 2));
  
  if (data.products && data.products.length > 0) {
    const skusToImport = data.products.map(p => p.sku);
    console.log(`Found SKUs to import: ${skusToImport.join(', ')}`);
    
    console.log(`Importing SKUs from Lightspeed...`);
    let importRes = await fetch(`${API_BASE}/lightspeed/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus: skusToImport })
    });
    console.log(await importRes.text());

    for (const sku of skusToImport) {
      console.log(`Pushing SKU ${sku} to WooCommerce...`);
      let pushRes = await fetch(`${API_BASE}/products/${sku}/push-to-woo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      console.log(await pushRes.text());
    }
  } else {
    console.log('Product not found via search.');
  }
}
main();
