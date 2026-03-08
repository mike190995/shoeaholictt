import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { enqueueTask } from '../lib/tasks.js';

export const apiRouter = Router();

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
apiRouter.post('/checkout', async (req, res, next) => {
  try {
    const { items, customer } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Invalid checkout payload' });
      return;
    }

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

