import { Router } from 'express';

export const apiRouter = Router();

/**
 * GET /api/products
 * Frontend-facing product feed with pagination and search.
 * Reads from Cloud SQL (the "Performance Mirror" of Lightspeed).
 */
apiRouter.get('/products', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    // const search = req.query.search as string | undefined; // TODO: implement ILIKE search

    // TODO: Query products from Prisma with ILIKE search + pagination
    // const products = await prisma.product.findMany({ ... });

    res.json({
      data: [],
      pagination: { limit, offset, total: 0 },
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

    // TODO: Query single product by SKU from Prisma
    // const product = await prisma.product.findUnique({ where: { sku } });

    res.json({ data: null, sku });
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
    // TODO: Query distinct categories from Prisma
    res.json({ data: [] });
  } catch (err) {
    next(err);
  }
});
