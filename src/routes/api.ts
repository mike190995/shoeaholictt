import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { enqueueTask } from '../lib/tasks.js';
import { validateBody } from '../middleware/validate.js';
import { config } from '../config/env.js';
import { createLightspeedClient } from '../services/lightspeed.js';

export const apiRouter = Router();

// Zod Schema for Checkout Payload
const CheckoutItemSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative().optional(),
});

const CheckoutPayloadSchema = z.object({
  items: z.array(CheckoutItemSchema).min(1, 'Cart cannot be empty'),
  customer: z.record(z.string(), z.unknown()).optional(),
});

// Rate Limiter for Checkout API
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 checkout requests per `window` (here, per 15 minutes)
  message: 'Too many checkout requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * GET /api/products
 * Frontend-facing product feed with pagination and search.
 */
apiRouter.get('/products', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search as string | undefined;

    const where = search
      ? { title: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      data: products,
      pagination: { limit, offset, total },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/:sku
 * Single product detail by SKU.
 */
apiRouter.get('/products/:sku', async (req, res, next) => {
  try {
    const { sku } = req.params;
    const product = await prisma.product.findUnique({ where: { sku } });

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/categories
 * Distinct categories from the product catalog.
 */
apiRouter.get('/categories', async (_req, res, next) => {
  try {
    const categories = await prisma.product.findMany({
      select: { category: true },
      distinct: ['category'],
      where: { category: { not: null } },
    });

    res.json({
      data: categories.map(c => c.category).filter(Boolean),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/checkout
 * Manages the transition from Custom Site cart to Lightspeed Sale.
 * Verifies inventory, performs atomic local update, enqueues Lightspeed sync.
 */
apiRouter.post('/checkout', checkoutLimiter, validateBody(CheckoutPayloadSchema), async (req, res, next) => {
  try {
    const { items, customer } = req.body;

    // 1. Transaction to carefully verify inventory and decrement stock atomically
    const syncLogId = await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { sku: item.sku },
        });

        if (!product || product.quantity < item.quantity) {
          throw new Error(`Insufficient stock for SKU: ${item.sku}`);
        }

        await tx.product.update({
          where: { sku: item.sku },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      // Record the pending sale in sync logs
      const syncLog = await tx.syncLog.create({
        data: {
          direction: 'site_to_ls',
          entityType: 'sale',
          entityId: `sale_${Date.now()}`, // Would be an actual order ID from frontend
          status: 'pending',
          payload: { items, customer },
        },
      });

      return syncLog.id;
    });

    // 2. Enqueue the async task to reflect this sale in Lightspeed
    if (process.env.NODE_ENV === 'production') {
      await enqueueTask('site_to_ls', { syncLogId, items, customer });
    } else {
      console.log(`[Dev] Bypassing Cloud Tasks for site_to_ls syncLogId=${syncLogId}`);
    }

    res.status(200).json({ success: true, message: 'Checkout processed successfully' });
  } catch (err: any) {
    if (err.message && err.message.includes('Insufficient stock')) {
      res.status(409).json({ error: err.message });
      return;
    }
    next(err);
  }
});

/**
 * GET /api/debug/lightspeed/:sku
 * FOR MANUAL VERIFICATION: Fetches raw data directly from Lightspeed.
 * GUARDED: Dev-only. Not exposed in production.
 */
if (config.nodeEnv !== 'production') {
  apiRouter.get('/debug/lightspeed/:sku', async (req, res, next) => {
    try {
      const { sku } = req.params;
      const product = await prisma.product.findUnique({ where: { sku } });
      if (!product || !product.metadata) {
        res.status(404).json({ error: 'Product not mirrored or missing metadata' });
        return;
      }

      const lsId = (product.metadata as any).lightspeedId;
      const lsClient = await createLightspeedClient();
      
      const [prodRes, invRes] = await Promise.all([
        lsClient.get(`/products/${lsId}`),
        lsClient.get(`/products/${lsId}/inventory`)
      ]);

      res.json({
        internalMirror: product,
        rawLightspeed: prodRes.data,
        rawInventory: invRes.data
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, details: err.response?.data });
    }
  });
}

