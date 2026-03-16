import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { isDuplicateSync, markSyncInProgress } from '../lib/redis.js';
import { enqueueTask } from '../lib/tasks.js';
import { config } from '../config/env.js';
import { validateBody } from '../middleware/validate.js';
import { log } from '../lib/logger.js';

export const webhookRouter = Router();

// Zod Schemas for Webhook Payloads
const WooWebhookSchema = z.object({
  id: z.number().or(z.string()),
  sku: z.string().optional(),
  stock_quantity: z.number().int(),
  name: z.string().optional(),
  price: z.string().or(z.number()).optional(),
}).passthrough();

const LightspeedWebhookSchema = z.object({
  itemID: z.string().or(z.number()),
  customSku: z.string().optional(),
  systemSku: z.string().optional(),
  qoh: z.string().or(z.number()),
  name: z.string().optional(),
}).passthrough();


webhookRouter.post('/woo', validateBody(WooWebhookSchema), async (req, res, next) => {
  try {
    const payload = req.body;

    const sku = payload.sku || String(payload.id);
    const quantity = payload.stock_quantity;

    // Deduplication via Redis (loop prevention)
    const isDuplicate = await isDuplicateSync(sku, 'woo_to_ls');
    if (isDuplicate) {
      log.debug({ sku }, '[Webhooks] Dropping Woo echo — loop prevention');
      res.status(200).json({ received: true, dropped: true });
      return;
    }

    // Mark as in-progress to prevent echo back from Lightspeed
    await markSyncInProgress(sku, 'woo_to_ls');

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
 * Implements HMAC-SHA256 validation as per Architecture Guide.
 */
webhookRouter.post('/lightspeed', async (req, res, next) => {
  try {
    // 1. HMAC Verification
    const signature = req.headers['x-signature'] as string;
    const rawBody = (req as any).rawBody;

    if (!signature || !rawBody) {
      log.warn({ path: '/webhooks/lightspeed' }, '[Webhooks] Missing signature or raw body');
      res.status(401).json({ error: 'Unauthorized: Missing signature' });
      return;
    }

    const expectedSignature = crypto
      .createHmac('sha256', config.lightspeedClientSecret)
      .update(rawBody)
      .digest('base64');

    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature)) === false) {
      log.warn({ path: '/webhooks/lightspeed' }, '[Webhooks] Invalid Lightspeed HMAC signature');
      res.status(401).json({ error: 'Unauthorized: Invalid signature' });
      return;
    }

    const payload = req.body;

    const sku = payload.customSku || payload.systemSku || String(payload.itemID);
    const quantity = parseInt(String(payload.qoh), 10);

    // Deduplication via Redis (loop prevention)
    const isDuplicate = await isDuplicateSync(sku, 'ls_to_woo');
    if (isDuplicate) {
      log.debug({ sku }, '[Webhooks] Dropping LS echo — loop prevention');
      res.status(200).json({ received: true, dropped: true });
      return;
    }

    // Mark as in-progress to prevent echo back from WooCommerce
    await markSyncInProgress(sku, 'ls_to_woo');

    // Enqueue task for async processing
    await enqueueTask('ls_to_woo', payload);

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
});
