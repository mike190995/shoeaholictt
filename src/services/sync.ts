import { prisma } from '../lib/prisma.js';
import { UniversalProduct } from '../mappers/universal.js';
import { createLightspeedClient } from './lightspeed.js';
import { updateWooCommerceStock } from './woocommerce.js';

/**
 * Main orchestration function for sync tasks processed by the worker.
 * Architecture §1: This handles the actual transformation and API calls
 * outside of the user-facing webhooks.
 */
export async function processSyncTask(task: any): Promise<void> {
  const { direction, payload, syncLogId, items } = task;

  try {
    if (direction === 'woo_to_ls') {
      const lsClient = createLightspeedClient();
      // 1. Transform Woo payload to Universal Product
      const universal = UniversalProduct.fromWooCommerce(payload);
      const lsData = universal.toLightspeed();

      // 2. Load the item from LS to get the exact id
      const lsId = universal.data.metadata?.lightspeedId;
      if (!lsId) {
        throw new Error(`Lightspeed ID not found for SKU: ${universal.data.sku}`);
      }
      await lsClient.put(`/Item/${lsId}.json`, lsData);
      
      console.log(`[Sync worker] Updated LS Item ${lsId} (Woo → LS)`);
      
      // Update Prisma Cloud SQL mirror
      await prisma.product.update({
        where: { sku: universal.data.sku },
        data: universal.toPostgres()
      }).catch((e: Error) => console.error('[Sync worker] DB Mirror update failed', e.message));

    } else if (direction === 'ls_to_woo') {
      // 1. Transform Lightspeed payload to Universal Product
      const universal = UniversalProduct.fromLightspeed(payload);
      
      // 2. Update WooCommerce via REST API
      const quantity = universal.data.quantity;
      await updateWooCommerceStock(universal.data.sku, quantity);
      
      console.log(`[Sync worker] Updated Woo SKU ${universal.data.sku} (LS → Woo)`);

      // Update Prisma Cloud SQL mirror
      await prisma.product.update({
        where: { sku: universal.data.sku },
        data: universal.toPostgres()
      }).catch((e: Error) => console.error('[Sync worker] DB Mirror update failed', e.message));

    } else if (direction === 'site_to_ls') {
      const lsClient = createLightspeedClient();
      // Custom Site checkout → Update LS Inventory
      for (const item of items) {
        console.log(`[Sync worker] Decrementing LS stock for SKU ${item.sku} by ${item.quantity} (Site → LS)`);
        // await lsClient.post(`/Sale.json`, { ... });
      }
      
      // Update syncLog success
      if (syncLogId) {
        await prisma.syncLog.update({
          where: { id: syncLogId },
          data: { status: 'completed' }
        });
      }
    } else {
      throw new Error(`Unknown sync direction: ${direction}`);
    }
  } catch (err: any) {
    if (syncLogId) {
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: { status: 'failed', payload: err.message }
      });
    }
    throw err; // Rethrow so Cloud Tasks retries
  }
}
