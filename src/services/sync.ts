/**
 * Sync Orchestration Service
 *
 * Handles the heavy lifting of cross-platform data synchronization.
 * Called by Cloud Tasks workers (not directly by webhook endpoints).
 *
 * Architecture §1: "The worker pulls the latest tokens from the DB,
 * transforms the data using the Universal Mapper, and updates the downstream API."
 */

import { UniversalProduct } from '../mappers/universal.js';

export type SyncDirection = 'ls_to_woo' | 'woo_to_ls' | 'site_to_ls';

interface SyncTask {
  direction: SyncDirection;
  entityType: 'product' | 'order' | 'sale';
  payload: Record<string, unknown>;
}

/**
 * Process a sync task dispatched from Cloud Tasks.
 *
 * Flow:
 * 1. Parse the incoming payload into UniversalProduct
 * 2. Transform to the destination format
 * 3. Push to the downstream API
 * 4. Log the result in sync_logs
 */
export async function processSyncTask(task: SyncTask): Promise<void> {
  console.log(`[Sync] Processing: ${task.direction} / ${task.entityType}`);

  switch (task.direction) {
    case 'ls_to_woo': {
      // TODO: UniversalProduct.fromLightspeed(task.payload) → .toWoo() → WooCommerce API
      void UniversalProduct.fromLightspeed(task.payload);
      break;
    }
    case 'woo_to_ls': {
      // TODO: UniversalProduct.fromWooCommerce(task.payload) → .toLightspeed() → Lightspeed API
      void UniversalProduct.fromWooCommerce(task.payload);
      break;
    }
    case 'site_to_ls': {
      // TODO: Custom Site cart → Lightspeed Sale
      break;
    }
    default:
      throw new Error(`Unknown sync direction: ${task.direction}`);
  }

  // TODO: Log to sync_logs table via Prisma
}
