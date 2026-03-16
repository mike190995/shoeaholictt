import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { createLightspeedClient } from '../services/lightspeed.js';
import { UniversalProduct } from '../mappers/universal.js';
import { updateWooCommerceStock } from '../services/woocommerce.js';

export const syncRouter = Router();

/**
 * GET /sync/pull
 * Performs a full pull of products from Lightspeed X-Series into the internal mirror.
 */
syncRouter.get('/pull', async (req, res, next) => {
  try {
    const lsClient = await createLightspeedClient();
    console.log('[Sync] Starting full product pull from Lightspeed X-Series...');

    const response = await lsClient.get('/products');
    let lsProducts = response.data.data || [];
    
    const totalCount = lsProducts.length;
    const activeCount = lsProducts.filter((p: any) => p.is_active === true || p.active === true).length;
    const ecwidCount = lsProducts.filter((p: any) => p.ecwid_enabled_webstore === true).length;
    const priceCount = lsProducts.filter((p: any) => parseFloat(String(p.price || p.retail_price || 0)) > 0).length;

    console.log(`[Sync] Stats: Total=${totalCount}, Active=${activeCount}, OnlineChannel=${ecwidCount}, HasPrice=${priceCount}`);

    // Strictly filter by "Online store" channel as requested.
    console.log(`[Sync] Enforcing strict 'Online store' channel filtering (ecwid_enabled_webstore: true).`);
    lsProducts = lsProducts.filter((p: any) => p.ecwid_enabled_webstore === true);

    let count = 0;
    for (const raw of lsProducts) {
      const universal = UniversalProduct.fromLightspeed(raw);
      const data = universal.toPostgres() as any;

      await prisma.product.upsert({
        where: { sku: universal.data.sku },
        update: data,
        create: data,
      });
      count++;
    }

    res.json({
      success: true,
      message: `Full pull complete. Processed ${count} active products from Lightspeed.`,
      count,
    });
  } catch (err) {
    console.error('[Sync] Pull failed:', err);
    next(err);
  }
});

/**
 * GET /sync/push-woo
 * Pushes all mirrored products from the local database to WooCommerce.
 */
syncRouter.get('/push-woo', async (req, res, next) => {
  try {
    console.log('[Sync] Starting product push to WooCommerce...');

    const products = await prisma.product.findMany();
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const product of products) {
      try {
        const universal = UniversalProduct.fromDatabase(product);
        await updateWooCommerceStock(product.sku, product.quantity, universal.toWoo());
        successCount++;
      } catch (err: any) {
        failCount++;
        errors.push(`SKU ${product.sku}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: `Push to WooCommerce complete.`,
      results: {
        success: successCount,
        failed: failCount,
        errors: errors.slice(0, 10), // Return first 10 errors
      },
    });
  } catch (err) {
    console.error('[Sync] Push failed:', err);
    next(err);
  }
});
