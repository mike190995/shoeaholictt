import { Router } from 'express';
import { isDuplicateSync, markSyncInProgress } from '../lib/redis.js';
import { enqueueTask } from '../lib/tasks.js';

export const webhookRouter = Router();

/**
 * POST /webhooks/woo
 * Receives WooCommerce webhooks.
 * Must respond with 200 OK within 200ms (Architecture §2C).
 */
webhookRouter.post('/woo', async (req, res, next) => {
  try {
    const payload = req.body;

    // Minimal validation
    if (!payload?.id || typeof payload.stock_quantity !== 'number') {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    const sku = payload.sku || String(payload.id);
    const quantity = payload.stock_quantity;

    // Deduplication via Redis (loop prevention)
    const isDuplicate = await isDuplicateSync(sku, quantity);
    if (isDuplicate) {
      console.log(`[Webhooks] Dropping echo update for Woo ${sku}:${quantity}`);
      res.status(200).json({ received: true, dropped: true });
      return;
    }

    // Mark as in-progress to prevent echo back from Lightspeed
    await markSyncInProgress(sku, quantity);

    // Enqueue task for async processing
    await enqueueTask('woo_to_ls', payload);

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /webhooks/lightspeed
 * Receives Lightspeed Retail webhooks.
 */
webhookRouter.post('/lightspeed', async (req, res, next) => {
  try {
    const payload = req.body;

    // Minimal validation
    if (!payload?.itemID || typeof payload.qoh !== 'string') {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    const sku = payload.customSku || payload.systemSku || String(payload.itemID);
    const quantity = parseInt(payload.qoh, 10);

    // Deduplication via Redis (loop prevention)
    const isDuplicate = await isDuplicateSync(sku, quantity);
    if (isDuplicate) {
      console.log(`[Webhooks] Dropping echo update for LS ${sku}:${quantity}`);
      res.status(200).json({ received: true, dropped: true });
      return;
    }

    // Mark as in-progress to prevent echo back from WooCommerce
    await markSyncInProgress(sku, quantity);

    // Enqueue task for async processing
    await enqueueTask('ls_to_woo', payload);

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
});
