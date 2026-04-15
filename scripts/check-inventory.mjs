import { initSecrets } from '../dist/config/env.js';
import { prisma } from '../dist/lib/prisma.js';
import axios from 'axios';

async function main() {
  await initSecrets();
  const cred = await prisma.credential.findUnique({ where: { platform: 'lightspeed' } });
  const h = { Authorization: `Bearer ${cred.accessToken}` };
  const base = 'https://shoptt.retail.lightspeed.app/api/2.0';

  // Resolve all variant product IDs for SKUs 14342–14362
  const TARGET_SKUS = Array.from({ length: 21 }, (_, i) => String(14342 + i));
  const skuMap = {};
  const productIds = new Set();

  console.log('Resolving SKU → Product ID...');
  for (const sku of TARGET_SKUS) {
    const res = await axios.get(`${base}/products`, { headers: h, params: { sku } });
    const p = Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;
    if (p) {
      skuMap[p.id] = { sku, name: p.variant_name || p.name };
      productIds.add(p.id);
      // Also add variants if this is a parent
      if (p.has_variants && p.variant_parent_id === null) {
        // This is the parent — also add parent ID
        productIds.add(p.id);
      }
    }
  }
  // Add the parent ID explicitly + family_id
  const parentId = 'db57e147-7ad6-4be8-8749-94f230f27d90';
  const familyId = 'f56e532e-30b0-41f5-8bf0-db0aa209ad41';
  productIds.add(parentId);

  console.log(`Looking for ${productIds.size} product IDs across entire inventory...`);

  // Get outlet names
  const outletsRes = await axios.get(`${base}/outlets`, { headers: h });
  const outlets = outletsRes.data.data.reduce((acc, o) => { acc[o.id] = o.name; return acc; }, {});

  // Paginate ALL inventory records 
  const inventoryByProduct = {};
  let after = null;
  let page = 0;
  let totalRecords = 0;

  while (page < 200) {
    page++;
    const params = { page_size: 500 };
    if (after) params.after = after;
    const res = await axios.get(`${base}/inventory`, { headers: h, params });
    const recs = res.data.data;
    if (!Array.isArray(recs) || recs.length === 0) break;
    totalRecords += recs.length;

    for (const rec of recs) {
      if (productIds.has(rec.product_id)) {
        if (!inventoryByProduct[rec.product_id]) inventoryByProduct[rec.product_id] = [];
        inventoryByProduct[rec.product_id].push(rec);
      }
    }

    const v = res.data.version;
    if (v?.max) after = v.max; else break;
    if (page % 20 === 0) {
      const found = Object.keys(inventoryByProduct).length;
      console.log(`Page ${page}: ${totalRecords} records scanned, ${found}/${productIds.size} products found`);
    }
  }

  console.log(`\nScan complete: ${totalRecords} records, ${Object.keys(inventoryByProduct).length} products found`);

  const INCLUDE = ['Frederick Street', 'San Fernando', 'Arima', 'Center City Mall', 'Aboutique Mall', 'Princes Town', 'Tobago', 'Warehouse'];
  
  console.log('\n=== INVENTORY REPORT: SKUs 14342–14362 ===');
  console.log('SKU | Variant | ' + INCLUDE.join(' | ') + ' | TOTAL (excl Warehouse)');
  console.log('-'.repeat(140));

  for (const sku of TARGET_SKUS) {
    // Find this SKU's product ID
    const entry = Object.entries(skuMap).find(([id, info]) => info.sku === sku);
    if (!entry) { console.log(`${sku} | NOT FOUND`); continue; }

    const [prodId, info] = entry;
    const records = inventoryByProduct[prodId] || [];
    if (records.length === 0) {
      console.log(`${sku} | ${info.name} | NO INVENTORY RECORDS`);
      continue;
    }

    const byOutlet = {};
    records.forEach(r => {
      const name = outlets[r.outlet_id] || r.outlet_id;
      byOutlet[name] = r.inventory_level;
    });
    const sellable = INCLUDE.filter(n => n !== 'Warehouse');
    const total = sellable.reduce((s, n) => s + (byOutlet[n] || 0), 0);
    const cols = INCLUDE.map(n => byOutlet[n] !== undefined ? String(byOutlet[n]) : '-');
    console.log(`${sku} | ${info.name} | ${cols.join(' | ')} | ${total}`);
  }
}

main().catch(console.error);
