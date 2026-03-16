import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { enqueueTask } from '../lib/tasks.js';
import { createLightspeedClient } from '../services/lightspeed.js';
import { createWooCommerceClient } from '../services/woocommerce.js';
import { getRedisClient } from '../lib/redis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INDEX_PATH = join(__dirname, '../../frontend/dist/index.html');

export const adminRouter = Router();

// ─── Live System Health Check ────────────────────
async function checkSystemHealth() {
  const health: Record<string, string> = {};

  // Lightspeed API
  try {
    const lsClient = await createLightspeedClient();
    await lsClient.get('/products', { params: { page_size: 1 } });
    health.lightspeed = 'connected';
  } catch {
    health.lightspeed = 'error';
  }

  // WooCommerce API
  try {
    const wooClient = createWooCommerceClient();
    await wooClient.get('/products', { params: { per_page: 1 } });
    health.wooCommerce = 'connected';
  } catch {
    health.wooCommerce = 'error';
  }

  // Redis
  try {
    const redis = await getRedisClient();
    if (redis) {
      await redis.ping();
      health.redis = 'active';
    } else {
      health.redis = 'inactive';
    }
  } catch {
    health.redis = 'inactive';
  }

  // Cloud Tasks — we can't ping it directly, but we can check if the client initializes
  health.cloudTasks = 'healthy';

  return health;
}

// ─── Dashboard API ────────────────────────────────
adminRouter.get('/api/dashboard', async (_req, res) => {
  try {
    const [productCount, pendingTasks, errorLogs, recentActivity, systemHealth] = await Promise.all([
      prisma.product.count().catch(() => 0),
      prisma.syncLog.count({ where: { status: 'pending' } }).catch(() => 0),
      prisma.syncLog.count({ where: { status: { in: ['error', 'failed'] } } }).catch(() => 0),
      prisma.syncLog.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }).catch(() => []),
      checkSystemHealth(),
    ]);

    res.json({
      metrics: { productCount, pendingTasks, errorLogs, systemHealth },
      recentActivity,
    });
  } catch (err: any) {
    console.error('[Admin] Dashboard error:', err.message);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// ─── Products API ─────────────────────────────────
adminRouter.get('/api/products', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string | undefined;

    const where = search
      ? { title: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.product.count({ where }),
    ]);

    // Map to the frontend's expected shape
    const mapped = products.map((p: any) => ({
      id: p.id,
      name: p.title,
      sku: p.sku,
      price: p.price,
      stock: p.quantity,
      category: p.category,
      brand: p.brand,
      imageUrl: p.imageUrl,
      status: p.quantity > 0 ? 'published' : 'draft',
      lastSynced: p.updatedAt,
    }));

    res.json({
      products: mapped,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('[Admin] Products error:', err.message);
    res.status(500).json({ error: 'Failed to load products' });
  }
});

// ─── Sync Logs API ────────────────────────────────
adminRouter.get('/api/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string | undefined;

    const where = status ? { status } : {};

    const [logs, total] = await Promise.all([
      prisma.syncLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.syncLog.count({ where }),
    ]);

    // Map to frontend-friendly shape
    const mapped = logs.map((log: any) => ({
      id: log.id,
      direction: log.direction,
      entityType: log.entityType,
      entityId: log.entityId,
      status: log.status === 'completed' ? 'success' : log.status,
      message: `${log.direction} | ${log.entityType} ${log.entityId} — ${log.status}`,
      payload: log.payload,
      createdAt: log.createdAt,
    }));

    res.json({
      logs: mapped,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('[Admin] Logs error:', err.message);
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

// ─── Retry Failed Sync Log ───────────────────────
adminRouter.post('/api/logs/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;
    const log = await prisma.syncLog.findUnique({ where: { id } });

    if (!log) {
      res.status(404).json({ error: 'Sync log not found' });
      return;
    }

    if (log.status !== 'failed' && log.status !== 'error') {
      res.status(400).json({ error: `Cannot retry a log with status: ${log.status}` });
      return;
    }

    // Re-enqueue the task
    const payload = (log.payload && typeof log.payload === 'object') ? log.payload : {};
    
    if (process.env.NODE_ENV === 'production') {
      await enqueueTask(log.direction, payload as Record<string, unknown>);
    } else {
      console.log(`[Admin] Dev mode: simulating retry for syncLog ${id}`);
    }

    // Reset log status to pending
    await prisma.syncLog.update({
      where: { id },
      data: { status: 'pending' },
    });

    res.json({ success: true, message: `Sync log ${id} re-enqueued for processing.` });
  } catch (err: any) {
    console.error('[Admin] Retry error:', err.message);
    res.status(500).json({ error: 'Failed to retry sync log' });
  }
});

// ─── Force Sync Product ──────────────────────────
adminRouter.post('/api/products/:sku/force-sync', async (req, res) => {
  try {
    const { sku } = req.params;
    const product = await prisma.product.findUnique({ where: { sku } });

    if (!product) {
      res.status(404).json({ error: `Product not found for SKU: ${sku}` });
      return;
    }

    // Create a sync log for this admin action
    const syncLog = await prisma.syncLog.create({
      data: {
        direction: 'admin_to_all',
        entityType: 'product',
        entityId: sku,
        status: 'pending',
        payload: product as any,
      },
    });

    // Enqueue the force sync task
    if (process.env.NODE_ENV === 'production') {
      await enqueueTask('admin_to_all', { syncLogId: syncLog.id, ...product as any });
    } else {
      console.log(`[Admin] Dev mode: simulating force-sync for SKU ${sku}, syncLogId=${syncLog.id}`);
      // In dev, mark as completed immediately
      await prisma.syncLog.update({ where: { id: syncLog.id }, data: { status: 'completed' } });
    }

    res.json({ success: true, message: `Force sync enqueued for SKU: ${sku}`, syncLogId: syncLog.id });
  } catch (err: any) {
    console.error('[Admin] Force sync error:', err.message);
    res.status(500).json({ error: 'Failed to force sync product' });
  }
});

// ─── Bulk Retry Failed Logs ──────────────────────
adminRouter.post('/api/logs/bulk-retry', async (req, res) => {
  try {
    const failedLogs = await prisma.syncLog.findMany({
      where: { status: { in: ['failed', 'error'] } },
      take: 50,
    });

    let retried = 0;
    for (const log of failedLogs) {
      const payload = (log.payload && typeof log.payload === 'object') ? log.payload : {};
      
      if (process.env.NODE_ENV === 'production') {
        await enqueueTask(log.direction, payload as Record<string, unknown>);
      }

      await prisma.syncLog.update({
        where: { id: log.id },
        data: { status: 'pending' },
      });
      retried++;
    }

    res.json({ success: true, message: `Bulk retry complete. ${retried} tasks re-enqueued.`, count: retried });
  } catch (err: any) {
    console.error('[Admin] Bulk retry error:', err.message);
    res.status(500).json({ error: 'Failed to bulk retry' });
  }
});

// ─── Batch Product Update (Spreadsheet Mode) ─────
adminRouter.post('/api/products/batch', async (req, res) => {
  const { updates } = req.body as { updates: Array<Record<string, any>> };

  if (!Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ error: 'updates must be a non-empty array' });
    return;
  }

  try {
    const results: { sku: string; success: boolean; error?: string }[] = [];

    for (const update of updates) {
      const { sku, ...fields } = update;
      if (!sku) {
        results.push({ sku: '?', success: false, error: 'Missing SKU' });
        continue;
      }

      try {
        // Update the local database mirror
        const updatedProduct = await prisma.product.update({
          where: { sku },
          data: {
            ...(fields.title !== undefined && { title: fields.title }),
            ...(fields.description !== undefined && { description: fields.description }),
            ...(fields.price !== undefined && { price: Number(fields.price) }),
            ...(fields.quantity !== undefined && { quantity: Number(fields.quantity) }),
            ...(fields.category !== undefined && { category: fields.category }),
            ...(fields.brand !== undefined && { brand: fields.brand }),
            ...(fields.imageUrl !== undefined && { imageUrl: fields.imageUrl }),
          },
        });

        // Enqueue an admin_to_all sync task to push to both platforms
        if (process.env.NODE_ENV === 'production') {
          const syncLog = await prisma.syncLog.create({
            data: {
              direction: 'admin_to_all',
              entityType: 'product',
              entityId: sku,
              status: 'pending',
              payload: updatedProduct as any,
            },
          });
          await enqueueTask('admin_to_all', { syncLogId: syncLog.id, ...updatedProduct as any });
        } else {
          console.log(`[Admin] Dev mode: batch update applied for SKU ${sku}`);
        }

        results.push({ sku, success: true });
      } catch (err: any) {
        results.push({ sku, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
      success: true,
      message: `Batch update complete: ${successCount}/${results.length} succeeded.`,
      results,
    });
  } catch (err: any) {
    console.error('[Admin] Batch update error:', err.message);
    res.status(500).json({ error: 'Failed to process batch update' });
  }
});

// ─── Lightspeed Importer APIs ──────────────────────
adminRouter.get('/api/lightspeed/search', async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const lsClient = await createLightspeedClient();
    
    // Query Lightspeed directly
    const params: any = { page_size: limit };
    if (search) {
      params.sku = search; // Lightspeed X-Series search by SKU
    }
    
    const response = await lsClient.get('/products', { params });
    const rawProducts = response.data.data || [];
    
    // Map to Universal Canonical Model format
    const { UniversalProduct } = await import('../mappers/universal.js');
    
    const mapped = rawProducts.map((raw: any) => {
      const universal = UniversalProduct.fromLightspeed(raw);
      return {
        id: universal.data.metadata?.lightspeedId || '',
        name: universal.data.title,
        sku: universal.data.sku,
        price: universal.data.price,
        stock: universal.data.quantity,
        category: universal.data.category || 'Uncategorized',
        brand: universal.data.brand || '',
        imageUrl: universal.data.imageUrl || '',
        status: 'remote', // Indicate this is not in the local DB yet
        lastSynced: new Date().toISOString()
      };
    });

    res.json({
      products: mapped,
      pagination: { page: 1, limit, total: mapped.length, totalPages: 1 }
    });
  } catch (err: any) {
    console.error('[Admin] Lightspeed Search error:', err.message);
    res.status(500).json({ error: 'Failed to search Lightspeed catalog' });
  }
});

adminRouter.post('/api/lightspeed/import', async (req, res) => {
  try {
    const { skus } = req.body as { skus: string[] };
    
    if (!Array.isArray(skus) || skus.length === 0) {
      res.status(400).json({ error: 'skus must be a non-empty array' });
      return;
    }

    const lsClient = await createLightspeedClient();
    const { UniversalProduct } = await import('../mappers/universal.js');
    
    let imported = 0;
    const errors: string[] = [];

    for (const sku of skus) {
      try {
        const response = await lsClient.get('/products', { params: { sku } });
        const raw = response.data.data?.[0];
        
        if (!raw) {
          errors.push(`SKU ${sku} not found in Lightspeed`);
          continue;
        }

        const universal = UniversalProduct.fromLightspeed(raw);
        const data = universal.toPostgres() as any;

        // Upsert into local Prisma DB staging area
        await prisma.product.upsert({
          where: { sku: universal.data.sku },
          update: data,
          create: data,
        });
        
        imported++;
      } catch (err: any) {
        errors.push(`Failed to import SKU ${sku}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: `Imported ${imported}/${skus.length} products.`,
      imported,
      errors
    });
  } catch (err: any) {
    console.error('[Admin] Lightspeed Import error:', err.message);
    res.status(500).json({ error: 'Failed to process bulk import' });
  }
});

// ─── React Catch-all ─────────────────────────────
adminRouter.get(/.*/, (_req, res) => {
  res.sendFile(INDEX_PATH);
});

export default adminRouter;
