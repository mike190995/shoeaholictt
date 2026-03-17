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
    const allProducts = response.data.data || [];
    
    // 2. Perform counts and filtering in a single pass
    let activeCount = 0;
    let ecwidCount = 0;
    let priceCount = 0;
    const filteredProducts = [];

    for (const p of allProducts) {
      const isActive = p.is_active === true || p.active === true;
      const isOnline = p.ecwid_enabled_webstore === true;
      const hasPrice = parseFloat(String(p.price || p.retail_price || 0)) > 0;

      if (isActive) activeCount++;
      if (isOnline) ecwidCount++;
      if (hasPrice) priceCount++;

      // Strictly filter by "Online store" channel as requested
      if (isOnline) {
        filteredProducts.push(p);
      }
    }

    console.log(`[Sync] Stats: Total=${allProducts.length}, Active=${activeCount}, Online=${ecwidCount}, HasPrice=${priceCount}`);
    console.log(`[Sync] Processing ${filteredProducts.length} products for internal mirror...`);

    let count = 0;
    for (const raw of filteredProducts) {
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
