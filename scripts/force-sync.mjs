import { initSecrets } from '../dist/config/env.js';
import { prisma } from '../dist/lib/prisma.js';
import { createLightspeedClient, fetchFullInventoryMap } from '../dist/services/lightspeed.js';
import { UniversalProduct } from '../dist/mappers/universal.js';

async function main() {
  console.log('🚀 Starting Full Catalog Inventory Correction Sync...');
  await initSecrets();

  const lsClient = await createLightspeedClient();
  
  // 1. Build the full inventory map (the "Real" data)
  const inventoryMap = await fetchFullInventoryMap(lsClient);
  console.log(`✅ Loaded ${inventoryMap.size} unique product stock levels.`);

  // 2. Paginate products and upsert
  let after = undefined;
  let imported = 0;
  let fetching = true;
  const BATCH_SIZE = 100;

  while (fetching) {
    const response = await lsClient.get('/products', { 
      params: { page_size: BATCH_SIZE, ...(after ? { after } : {}) } 
    });
    
    const rawItems = response.data.data || [];
    if (rawItems.length === 0) break;

    process.stdout.write(`\rSyncing items: ${imported} ... `);

    for (const item of rawItems) {
      try {
        // Enrich item with pre-calculated inventory from our map
        item.inventory_level = inventoryMap.get(item.id) || 0;
        
        const universal = UniversalProduct.fromLightspeed(item);
        const dbData = universal.toPostgres();
        
        await prisma.product.upsert({
          where: { sku: universal.data.sku },
          update: dbData,
          create: dbData,
        });
        imported++;
      } catch (e) {
        // Skip items without SKUs or other errors
      }
    }

    const version = response.data.version;
    if (version?.max && rawItems.length > 0) {
      after = version.max;
    } else {
      fetching = false;
    }
  }

  console.log(`\n\n🎉 SUCCESS! Synchronized ${imported} products with CORRECT inventory (including Warehouse).`);
}

main().catch(console.error);
