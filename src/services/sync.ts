import { prisma } from '../lib/prisma.js';
import { UniversalProduct } from '../mappers/universal.js';
import { createLightspeedClient } from './lightspeed.js';
import { updateWooCommerceStock } from './woocommerce.js';
import { config } from '../config/env.js';
import { log } from '../lib/logger.js';

/**
 * Main orchestration function for sync tasks processed by the worker.
 * Architecture §1: This handles the actual transformation and API calls
 * outside of the user-facing webhooks.
 */
export async function processSyncTask(task: any): Promise<void> {
  const { direction, payload, syncLogId, items } = task;

  try {
    if (direction === 'woo_to_ls') {
      const lsClient = await createLightspeedClient();
      // 1. Transform Woo payload to Universal Product
      const universal = UniversalProduct.fromWooCommerce(payload);
      const lsData = universal.toLightspeed();

      // 2. Load the item from LS to get the exact id
      const lsId = universal.data.metadata?.lightspeedId;
      if (!lsId) {
        // In X-Series, if we don't have an ID, we might need to search by SKU
        log.debug({ sku: universal.data.sku }, '[Sync] Lightspeed ID not found — searching by SKU');
        const searchRes = await lsClient.get('/products', { params: { sku: universal.data.sku } });
        const existing = searchRes.data.data?.[0];
        
        if (existing) {
          await lsClient.put(`/products/${existing.id}`, lsData);
          log.info({ lsId: existing.id }, '[Sync] Updated LS Product (Woo → LS)');
        } else {
          await lsClient.post('/products', lsData);
          log.info({ sku: universal.data.sku }, '[Sync] Created new LS Product (Woo → LS)');
        }
      } else {
        await lsClient.put(`/products/${lsId}`, lsData);
        log.info({ lsId }, '[Sync] Updated LS Product (Woo → LS)');
      }
      
      // Update Prisma Cloud SQL mirror
      await prisma.product.update({
        where: { sku: universal.data.sku },
        data: universal.toPostgres()
      }).catch((e: Error) => console.error('[Sync worker] DB Mirror update failed', e.message));

    } else if (direction === 'ls_to_woo') {
      // 1. Transform Lightspeed payload to Universal Product
      const universal = UniversalProduct.fromLightspeed(payload);
      
      // 2. Update WooCommerce via REST API (Full Sync)
      const quantity = universal.data.quantity;
      await updateWooCommerceStock(universal.data.sku, quantity, universal.toWoo());
      
      log.info({ sku: universal.data.sku }, '[Sync] Full sync complete (LS → Woo)');

      // Update Prisma Cloud SQL mirror
      await prisma.product.upsert({
        where: { sku: universal.data.sku },
        update: universal.toPostgres() as any,
        create: universal.toPostgres() as any
      }).catch((e: Error) => console.error('[Sync worker] DB Mirror update failed', e.message));

    } else if (direction === 'site_to_ls') {
      const lsClient = await createLightspeedClient();
      // Custom Site checkout → Update LS Inventory
      for (const item of items) {
        log.info({ sku: item.sku, qty: item.quantity }, '[Sync] Decrementing LS stock (Site → LS)');
        
        // 1. Find product ID by SKU (if needed, or assume item.sku holds the LS ID)
        const searchRes = await lsClient.get('/products', { params: { sku: item.sku } });
        const product = searchRes.data.data?.[0];

        if (!product) {
          throw new Error(`[Sync worker] Product not found in LS for SKU: ${item.sku}`);
        }

        // 2. Fetch specific inventory for this product
        const invRes = await lsClient.get(`/products/${product.id}/inventory`);
        const inventoryArray = invRes.data.data;

        if (!inventoryArray || inventoryArray.length === 0) {
           throw new Error(`[Sync worker] No inventory records found in LS for product: ${product.id}`);
        }

        // 3. Find the specific internet fulfillment outlet, or fallback to the first one
        let targetInventory = inventoryArray.find((inv: any) => inv.outlet_id === config.lightspeedOutletId);
        
        if (!targetInventory) {
          log.warn({ outletId: config.lightspeedOutletId, sku: item.sku }, '[Sync] Configured Outlet ID not found — falling back to default');
          targetInventory = inventoryArray[0];
        }

        const currentCount = parseInt(targetInventory.count || "0", 10);
        const newCount = Math.max(0, currentCount - item.quantity); // Prevent negative stock

        // 4. Update the inventory for that specific outlet
        await lsClient.put(`/products/${product.id}/inventory`, {
          inventory: [
            {
              outlet_id: targetInventory.outlet_id,
              count: newCount
            }
          ]
        });

        log.info({ sku: item.sku, newCount }, '[Sync] LS stock updated');
      }
      
      // Update syncLog success
      if (syncLogId) {
        await prisma.syncLog.update({
          where: { id: syncLogId },
          data: { status: 'completed' }
        });
      }
    } else if (direction === 'admin_to_all') {
      const universal = UniversalProduct.fromDatabase(payload);
      
      log.info({ sku: universal.data.sku }, '[Sync] Starting bilateral sync (Admin → All)');
      
      // 1. Push to WooCommerce
      try {
        await updateWooCommerceStock(universal.data.sku, universal.data.quantity);
        log.info({ sku: universal.data.sku }, '[Sync] Updated WooCommerce');
      } catch (err: any) {
        log.error({ sku: universal.data.sku, error: err.message }, '[Sync] Failed to update WooCommerce');
      }

      // 2. Push to Lightspeed X-Series
      try {
        const lsClient = await createLightspeedClient();
        const lsId = universal.data.metadata?.lightspeedId;
        const lsData = universal.toLightspeed();
        
        if (lsId) {
          await lsClient.put(`/products/${lsId}`, lsData);
          log.info({ lsId }, '[Sync] Updated Lightspeed X-Series');
        } else {
          // Fallback to searching by SKU if no LS ID is stored
          const searchRes = await lsClient.get('/products', { params: { sku: universal.data.sku } });
          const existing = searchRes.data.data?.[0];
          if (existing) {
             await lsClient.put(`/products/${existing.id}`, lsData);
             log.info({ lsId: existing.id }, '[Sync] Updated Lightspeed X-Series via SKU match');
          }
        }
      } catch (err: any) {
        log.error({ sku: universal.data.sku, error: err.message }, '[Sync] Failed to update Lightspeed');
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
