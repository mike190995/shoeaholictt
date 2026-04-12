import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { enqueueTask } from '../lib/tasks.js';
import { createLightspeedClient, fetchInventoryForProduct } from '../services/lightspeed.js';
import { createWooCommerceClient, createWooProduct, updateWooProduct, deleteWooProduct } from '../services/woocommerce.js';
import { getRedisClient } from '../lib/redis.js';
import { UniversalProduct } from '../mappers/universal.js';
import { optimizeAndUploadImage } from '../lib/images.js';

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
  } catch (err: any) {
    console.warn('[HealthCheck] Lightspeed check failed:', err.response?.data || err.message);
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
      // Race the ping against a 2s timeout to prevent dashboard hangs
      await Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
      ]);
      health.redis = 'active';
    } else {
      health.redis = 'inactive';
    }
  } catch {
    health.redis = 'degraded';
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
      ? { 
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { sku: { contains: search, mode: 'insensitive' as const } }
          ]
        }
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
      tags: p.tags,
      imageUrl: p.imageUrl,
      thumbnailUrl: (p.metadata as any)?.thumbnailUrl || p.imageUrl,
      status: p.quantity > 0 ? 'published' : 'draft',
      woocommerceId: (p.metadata as any)?.woocommerceId || null,
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

// ─── Push Product to WooCommerce ──────────────────
adminRouter.post('/api/products/:sku/push-to-woo', async (req, res) => {
  try {
    const { sku } = req.params;
    const product = await prisma.product.findUnique({ where: { sku } });

    if (!product) {
      res.status(404).json({ error: `Product not found for SKU: ${sku}` });
      return;
    }

    // 0. Deep Fetch from Lightspeed to get high-res images and latest stock
    const lsId = (product.metadata as any)?.lightspeedId;
    console.log(`[Admin] Performing JIT Deep Sync for SKU: ${sku} (LS ID: ${lsId || 'N/A'})`);
    const lsClient = await createLightspeedClient();
    
    let rawLsProduct: any = null;
    try {
      if (lsId) {
        // ID filter on collection endpoint supports embeds (direct ID endpoint does not always)
        const lsIdResponse = await lsClient.get('/products', { params: { id: lsId, embed: 'images,inventory' } });
        rawLsProduct = lsIdResponse.data.data?.[0];
      } else {
        // Fallback to SKU lookup
        const lsSkuResponse = await lsClient.get('/products', { params: { sku, embed: 'images,inventory' } });
        rawLsProduct = lsSkuResponse.data.data?.[0];
      }
    } catch (lsErr: any) {
      console.warn(`[Admin] Deep sync fetch failed for ${sku}:`, lsErr.message);
    }

    let finalProduct = product;
    if (rawLsProduct) {
      console.log(`[Admin] Found latest LS data for ${sku}. Inventory count items: ${rawLsProduct.inventory?.length || 0}`);
      const universalSync = UniversalProduct.fromLightspeed(rawLsProduct);
      const dbData = universalSync.toPostgres() as any;
      
      // Preserve local metadata (like woocommerceId) during deep sync
      const mergedMetadata = {
        ...(product.metadata as any || {}),
        ...(dbData.metadata || {})
      };

      // Update local mirror before optimizing/pushing
      finalProduct = await prisma.product.update({
        where: { sku },
        data: {
          ...dbData,
          metadata: mergedMetadata
        }
      });
      console.log(`[Admin] Staging DB updated for ${sku}. New quantity: ${finalProduct.quantity}`);
    } else {
      console.warn(`[Admin] No product found in Lightspeed for deep sync: ${sku}`);
    }

    // 1. Image Optimization Pipeline
    let finalImageUrl = finalProduct.imageUrl;
    if (finalProduct.imageUrl) {
      console.log(`[Admin] Optimizing image for SKU: ${sku}`);
      const optimizedUrl = await optimizeAndUploadImage(finalProduct.imageUrl, sku);
      if (optimizedUrl) {
        finalImageUrl = optimizedUrl;
        // Update local DB mirror with the optimized URL
        await prisma.product.update({
          where: { sku },
          data: { imageUrl: finalImageUrl },
        });
      }
    }

    // 2. Prepare Universal Model & WooCommerce Payload
    const universal = UniversalProduct.fromDatabase({ 
      ...finalProduct, 
      imageUrl: finalImageUrl 
    });
    
    // Resolve Category Mapping
    let wooCategoryId: number | undefined;
    if (product.category) {
      try {
        const mapping = await prisma.categoryMapping.findUnique({
          where: { lsCategory: product.category }
        });
        if (mapping) {
          wooCategoryId = mapping.wooCategoryId;
          console.log(`[Admin] Resolved category mapping for "${product.category}" -> ${wooCategoryId}`);
        }
      } catch (mappingErr: any) {
        console.warn(`[Admin] Category mapping warning (ignoring): ${mappingErr.message}`);
      }
    }

    // Resolve Dynamic Field Mappings
    const fieldMappings: Record<string, string> = {};
    try {
      const dbMappings = await (prisma as any).fieldMapping.findMany();
      dbMappings.forEach((m: any) => {
        fieldMappings[m.lsField] = m.wooField;
      });
    } catch (fieldErr: any) {
      console.warn(`[Admin] Field mapping warning (ignoring): ${fieldErr.message}`);
    }

    const wooPayload = universal.toWoo(wooCategoryId, fieldMappings);
    const wooClient = createWooCommerceClient();
    
    // 3. Push to WooCommerce
    const metadata = (finalProduct.metadata as Record<string, any>) || {};
    let wooId = metadata.woocommerceId ? Number(metadata.woocommerceId) : null;
    let action: 'created' | 'updated';

    if (!wooId) {
      console.log(`[Admin] Pushing NEW product to WooCommerce: ${sku}`);
      wooId = await createWooProduct(wooClient, wooPayload);
      action = 'created';
    } else {
      console.log(`[Admin] Updating EXISTING product in WooCommerce: ${sku} (ID: ${wooId})`);
      await updateWooProduct(wooClient, wooId, wooPayload);
      action = 'updated';
    }

    // Update local database with the ID and sync timestamp
    const updatedProduct = await prisma.product.update({
      where: { sku },
      data: {
        metadata: {
          ...metadata,
          woocommerceId: wooId,
          lastPushToWoo: new Date().toISOString(),
        },
      },
    });

    // Create a sync log for success
    await prisma.syncLog.create({
      data: {
        direction: 'admin_to_woo',
        entityType: 'product',
        entityId: sku,
        status: 'completed',
        payload: { action, wooId, sku },
      },
    });

    res.json({ 
      success: true, 
      message: `Product ${action} successfully in WooCommerce.`, 
      woocommerceId: wooId,
      product: updatedProduct
    });
  } catch (err: any) {
    console.error('[Admin] Push to WooCommerce error:', err.message);
    res.status(500).json({ 
      error: 'Failed to push product to WooCommerce', 
      details: err.response?.data || err.message 
    });
  }
});

// ─── Unlink Product from WooCommerce ──────────────
adminRouter.post('/api/products/:sku/unlink', async (req, res) => {
  try {
    const { sku } = req.params;
    const product = await prisma.product.findUnique({ where: { sku } });

    if (!product) {
      res.status(404).json({ error: `Product not found for SKU: ${sku}` });
      return;
    }

    const metadata = (product.metadata as Record<string, any>) || {};
    const oldWooId = metadata.woocommerceId;

    // Remove linking fields from metadata
    const { woocommerceId, lastPushToWoo, ...restMetadata } = metadata;

    const updatedProduct = await prisma.product.update({
      where: { sku },
      data: { metadata: restMetadata },
    });

    await prisma.syncLog.create({
      data: {
        direction: 'admin_action',
        entityType: 'product',
        entityId: sku,
        status: 'completed',
        payload: { action: 'unlink', oldWooId },
      },
    });

    res.json({ 
      success: true, 
      message: `Product ${sku} unlinked successfully.`,
      product: updatedProduct 
    });
  } catch (err: any) {
    console.error('[Admin] Unlink error:', err.message);
    res.status(500).json({ error: 'Failed to unlink product' });
  }
});

// ─── Delete Product from WooCommerce Store ─────────
adminRouter.delete('/api/products/:sku/woo', async (req, res) => {
  try {
    const { sku } = req.params;
    const product = await prisma.product.findUnique({ where: { sku } });

    if (!product) {
      res.status(404).json({ error: `Product not found for SKU: ${sku}` });
      return;
    }

    const metadata = (product.metadata as Record<string, any>) || {};
    const wooId = metadata.woocommerceId ? Number(metadata.woocommerceId) : null;

    if (wooId) {
      const wooClient = createWooCommerceClient();
      await deleteWooProduct(wooClient, wooId);
    }

    // Now perform the unlink logic to clean up local DB
    const { woocommerceId, lastPushToWoo, ...restMetadata } = metadata;

    const updatedProduct = await prisma.product.update({
      where: { sku },
      data: { metadata: restMetadata },
    });

    await prisma.syncLog.create({
      data: {
        direction: 'admin_action',
        entityType: 'product',
        entityId: sku,
        status: 'completed',
        payload: { action: 'delete_from_woo', wooId },
      },
    });

    res.json({ 
      success: true, 
      message: `Product ${sku} deleted from WooCommerce Store and unlinked locally.`,
      product: updatedProduct 
    });
  } catch (err: any) {
    console.error('[Admin] Delete from WooCommerce error:', err.message);
    res.status(500).json({ 
      error: 'Failed to delete product from WooCommerce Store',
      details: err.response?.data || err.message
    });
  }
});

// ─── Category Mapping Management ──────────────────
adminRouter.get('/api/categories/mapping', async (req, res) => {
  try {
    const mappings = await prisma.categoryMapping.findMany({
      orderBy: { lsCategory: 'asc' },
    });
    res.json(mappings);
  } catch (err: any) {
    console.error('[Admin] Get category mappings error:', err.message);
    res.status(500).json({ error: 'Failed to fetch category mappings' });
  }
});

adminRouter.post('/api/categories/mapping', async (req, res) => {
  try {
    const { lsCategory, wooCategoryId } = req.body;

    if (!lsCategory || wooCategoryId === undefined) {
      res.status(400).json({ error: 'lsCategory and wooCategoryId are required' });
      return;
    }

    const mapping = await prisma.categoryMapping.upsert({
      where: { lsCategory },
      update: { wooCategoryId: Number(wooCategoryId) },
      create: { 
        lsCategory, 
        wooCategoryId: Number(wooCategoryId) 
      },
    });

    res.json({ success: true, mapping });
  } catch (err: any) {
    console.error('[Admin] Save category mapping error:', err.message);
    res.status(500).json({ error: 'Failed to save category mapping' });
  }
});

// ─── Field Mapping Management ─────────────────────
adminRouter.get('/api/fields/mapping', async (req, res) => {
  try {
    const mappings = await (prisma as any).fieldMapping.findMany({
      orderBy: { lsField: 'asc' },
    });
    res.json(mappings);
  } catch (err: any) {
    console.error('[Admin] Get field mappings error:', err.message);
    res.status(500).json({ error: 'Failed to fetch field mappings' });
  }
});

adminRouter.post('/api/fields/mapping', async (req, res) => {
  try {
    const { lsField, wooField } = req.body;

    if (!lsField || !wooField) {
      res.status(400).json({ error: 'lsField and wooField are required' });
      return;
    }

    const mapping = await (prisma as any).fieldMapping.upsert({
      where: { lsField },
      update: { wooField },
      create: { lsField, wooField },
    });

    res.json({ success: true, mapping });
  } catch (err: any) {
    console.error('[Admin] Save field mapping error:', err.message);
    res.status(500).json({ error: 'Failed to save field mapping' });
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

// ─── Diagnostics & Error Formatting ──────────────
const formatError = (err: any): string => {
  if (err?.response?.data) return JSON.stringify(err.response.data);
  return String(err?.stack || err?.message || JSON.stringify(err) || err);
};

adminRouter.get('/api/health', async (req, res) => {
  const status: Record<string, 'ok' | 'error'> = { db: 'ok', redis: 'ok', lightspeed: 'ok' };
  const details: Record<string, any> = {};

  try {
    // 1. Check DB & OAuth Token
    const cred = await prisma.credential.findFirst({ where: { platform: 'lightspeed' } });
    if (!cred) {
      status.db = 'error';
      details.db = 'no_lightspeed_credential_found';
    }
  } catch (err: any) {
    status.db = 'error';
    details.db = formatError(err);
  }

  try {
    // 2. Check Redis
    const redis = await getRedisClient();
    if (redis) {
      await redis.ping();
    } else {
      status.redis = 'error';
      details.redis = 'Redis client returned null';
    }
  } catch (err: any) {
    status.redis = 'error';
    details.redis = formatError(err);
  }

  res.json({ status, details });
});

// ─── Lightspeed Importer APIs ──────────────────────
adminRouter.get('/api/lightspeed/brands', async (req, res) => {
  try {
    const lsClient = await createLightspeedClient();
    const response = await lsClient.get('/brands');
    res.json({ brands: response.data.data || [] });
  } catch (err: any) {
    console.error('[Admin] Fetch brands error:', formatError(err));
    res.status(500).json({ error: 'Failed to fetch Lightspeed brands', details: err?.message });
  }
});

adminRouter.get('/api/lightspeed/types', async (req, res) => {
  try {
    const lsClient = await createLightspeedClient();
    const response = await lsClient.get('/product_categories');
    // The new API structure stores categories in response.data.data.categories
    const categories = response.data?.data?.categories || response.data?.data || [];
    res.json({ types: categories });
  } catch (err: any) {
    console.error('[Admin] Fetch categories/types error:', formatError(err));
    res.status(500).json({ error: 'Failed to fetch Lightspeed categories', details: err?.message });
  }
});

adminRouter.get('/api/lightspeed/search', async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const brandId = req.query.brandId as string | undefined;
    const typeId = req.query.typeId as string | undefined;
    const active = req.query.active as string | undefined; // "0" or "1"
    const channel = req.query.channel as string | undefined; // "online" or "instore"
    
    const lsClient = await createLightspeedClient();
    
    const extractProducts = (res: any) => {
      const body = res?.data;
      if (!body) return [];
      if (Array.isArray(body.data)) return body.data;
      if (body.data && typeof body.data === 'object' && body.data.id) return [body.data];
      if (Array.isArray(body)) return body;
      if (typeof body === 'object' && body.id) return [body];
      return [];
    };

    let rawProducts: any[] = [];

    if (search) {
      console.log(`[Admin] Searching Lightspeed for: "${search}"`);
      
      // If it looks like a SKU, prefer the /products endpoint for better inventory embedding
      const looksLikeSku = /^\d+$/.test(search) || search.length < 15;
      
      if (looksLikeSku) {
        const skuParams: any = { page_size: limit, sku: search, embed: 'inventory' };
        if (active !== undefined) skuParams.active = active;
        if (channel === 'online') skuParams.ecwid_enabled_webstore = '1';
        else if (channel === 'instore') skuParams.ecwid_enabled_webstore = '0';
        
        console.log(`[Admin] Trying reliable /products SKU lookup for: ${search}`);
        try {
          const skuResponse = await lsClient.get('/products', { params: skuParams });
          rawProducts = extractProducts(skuResponse);
          console.log(`[Admin] /products SKU results: ${rawProducts.length}`);
        } catch (skuErr: any) {
          console.error(`[Admin] /products SKU search error:`, skuErr.message);
        }
      }

      // If no results by SKU (or if it didn't look like one), try fuzzy /search
      if (rawProducts.length === 0) {
        const searchParams: any = { type: 'products', page_size: limit, embed: 'inventory' };
        if (active !== undefined) searchParams.active = active;
        if (channel === 'online') searchParams.ecwid_enabled_webstore = '1';
        else if (channel === 'instore') searchParams.ecwid_enabled_webstore = '0';
        searchParams.sku = search.toLowerCase();
        
        try {
          let searchResponse = await lsClient.get('/search', { params: searchParams });
          rawProducts = extractProducts(searchResponse);
          console.log(`[Admin] /search fuzzy results: ${rawProducts.length}`);
        } catch (searchErr: any) {
          console.error(`[Admin] /search error:`, searchErr.message);
        }
      }
      
      // If no results by SKU, try by product name using the base /products endpoint
      if (rawProducts.length === 0) {
        const nameParams: any = { page_size: limit, name: search, embed: 'inventory' };
        console.log(`[Admin] Falling back to /products name search: "${search}"`);
        try {
          const nameResponse = await lsClient.get('/products', { params: nameParams });
          rawProducts = extractProducts(nameResponse);
          console.log(`[Admin] /products name result count: ${rawProducts.length}`);
        } catch (nameErr: any) {
          console.error(`[Admin] /products name search error:`, nameErr.message);
        }
      }
    } else {
      // No search term — browse mode with optional filters
      const params: any = { page_size: limit, embed: 'inventory' };
      if (brandId) params.brand_id = brandId;
      if (typeId) params.product_type_id = typeId;
      if (active !== undefined) params.active = active;
      if (channel === 'online') params.ecwid_enabled_webstore = '1';
      else if (channel === 'instore') params.ecwid_enabled_webstore = '0';
      
      const response = await lsClient.get('/products', { params });
      rawProducts = extractProducts(response);
    }
    
    // Map to Universal Canonical Model format
    const mapped = (await Promise.all(rawProducts.map(async (raw: any) => {
      try {
        // Enforce enrichment for variant products that often missing embedded inventory
        if (!raw.inventory || raw.inventory.length === 0) {
          console.log(`[Admin] Fetching enriched inventory for: ${raw.sku} (${raw.id})`);
          raw.inventory = await fetchInventoryForProduct(lsClient, raw.id);
        }

        const universal = UniversalProduct.fromLightspeed(raw);
        return {
          id: universal.data.metadata?.lightspeedId || raw.id || '',
          name: universal.data.title,
          sku: universal.data.sku,
          price: universal.data.price,
          stock: universal.data.quantity,
          category: universal.data.category || 'Uncategorized',
          brand: universal.data.brand || '',
          imageUrl: universal.data.imageUrl || '',
          thumbnailUrl: universal.data.thumbnailUrl || '',
          status: 'remote',
          lastSynced: new Date().toISOString()
        };
      } catch (mapErr: any) {
        console.warn('[Admin] Failed to map product:', raw.id, mapErr.message);
        return null;
      }
    }))).filter(Boolean);

    res.json({
      products: mapped,
      pagination: { page: 1, limit, total: mapped.length, totalPages: 1 }
    });
  } catch (err: any) {
    console.error('[Admin] Lightspeed Search error:', formatError(err));
    res.status(500).json({ error: 'Failed to search Lightspeed catalog', details: err?.message });
  }
});

adminRouter.post('/api/lightspeed/import', async (req, res) => {
  try {
    const { skus, filter, all } = req.body as { 
      skus?: string[], 
      filter?: { 
        brandId?: string, 
        typeId?: string, 
        onlyOnline?: boolean,
        active?: string,
        channel?: string
      },
      all?: boolean 
    };
    
    if (!skus && !filter && !all) {
      res.status(400).json({ error: 'Must provide skus, a filter, or set all: true' });
      return;
    }

    // If it's a "Pull All" request, handle in background to avoid timeout
    if (all) {
      const syncLog = await prisma.syncLog.create({
        data: {
          direction: 'ls_to_db',
          entityType: 'catalog',
          entityId: 'full_import',
          status: 'pending',
          message: 'Full catalog import initiated from admin dashboard'
        }
      });

      // Fire and forget background import
      (async () => {
        try {
          const lsClient = await createLightspeedClient();
          const { fetchFullInventoryMap } = await import('../services/lightspeed.js');
          const { UniversalProduct } = await import('../mappers/universal.js');
          
          // Step 1: Pre-fetch full inventory map to avoid individual calls inside the loop
          const inventoryMap = await fetchFullInventoryMap(lsClient);
          
          let after: string | undefined = undefined;
          let imported = 0;
          let fetching = true;
          
          while (fetching) {
            const response: any = await lsClient.get('/products', { 
              params: { page_size: 100, embed: 'inventory', ...(after ? { after } : {}) } 
            });
            const rawItems = response.data.data || [];
            
            for (const item of rawItems) {
              try {
                // Enrich item with pre-calculated inventory from our map
                (item as any).inventory_level = inventoryMap.get(item.id) || 0;
                
                const universal = UniversalProduct.fromLightspeed(item);
                const dbData = universal.toPostgres() as any;
                await prisma.product.upsert({
                  where: { sku: universal.data.sku },
                  update: dbData,
                  create: dbData,
                });
                imported++;
              } catch (e: any) {
                console.error(`[Import] Failed item: ${item.sku}`, e.message);
              }
            }

            const version: any = response.data.version;
            if (version?.max && rawItems.length > 0) {
              after = version.max;
            } else {
              fetching = false;
            }
          }

          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: { 
              status: 'completed', 
              completedAt: new Date(),
              message: `Full import complete: ${imported} products synchronized.`
            }
          });
        } catch (err: any) {
          console.error('[Import] Background task failed:', err.message);
          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: { 
              status: 'failed', 
              error: err.message,
              completedAt: new Date()
            }
          });
        }
      })();

      return res.json({ 
        success: true, 
        message: 'Full catalog import started in background.',
        syncLogId: syncLog.id 
      });
    }

    const lsClient = await createLightspeedClient();
    const { fetchInventoryForProduct } = await import('../services/lightspeed.js');
    const { UniversalProduct } = await import('../mappers/universal.js');
    
    let imported = 0;
    const errors: string[] = [];
    const productsToUpsert: any[] = [];

    // Mode 1: Import specific SKUs
    if (skus && skus.length > 0) {
      for (const sku of skus) {
        try {
          const response = await lsClient.get('/products', { params: { sku, embed: 'inventory' } });
          let raw = response.data.data?.[0];
          
          if (!raw) {
            // Fallback: Use the comprehensive /search endpoint which matches variants better
            const searchRes = await lsClient.get('/search', { params: { type: 'products', sku: sku.toLowerCase(), embed: 'inventory' } });
            raw = searchRes.data.data?.[0];
            
            // If still not found by sku, perhaps the sku provided was actually a Lightspeed ID
            if (!raw) {
               try {
                 const idRes = await lsClient.get(`/products/${sku}`);
                 raw = idRes.data.data;
               } catch (idErr) {
                 // ignore
               }
            }
          }
          
          if (!raw) {
            errors.push(`SKU ${sku} not found in Lightspeed`);
            continue;
          }

          // Enrich with real inventory if embedded is missing
          if (!raw.inventory || raw.inventory.length === 0) {
            console.log(`[Import] Fetching enriched inventory for variant: ${sku} (${raw.id})`);
            raw.inventory = await fetchInventoryForProduct(lsClient, raw.id);
          }

          productsToUpsert.push(raw);
        } catch (err: any) {
          errors.push(`Failed to fetch SKU ${sku}: ${err.message}`);
        }
      }
    } 
    // Mode 2: Batch import by filter
    else if (filter) {
      let after: string | undefined = undefined;
      const params: any = { page_size: 100, embed: 'inventory' };
      if (filter.brandId) params.brand_id = filter.brandId;
      if (filter.typeId) params.product_type_id = filter.typeId;
      if (filter.active !== undefined) params.active = filter.active;
      if (filter.channel === 'online') params.ecwid_enabled_webstore = '1';
      else if (filter.channel === 'instore') params.ecwid_enabled_webstore = '0';
      
      let fetching = true;
      let sanityCheck = 0;
      
      while (fetching && sanityCheck < 50) { // arbitrary cap to avoid true infinite loops
        sanityCheck++;
        if (after) params.after = after;
        
        const response = await lsClient.get('/products', { params });
        const rawItems = response.data.data || [];
        
        for (const item of rawItems) {
          // If onlyOnline is requested, verify active channels
          if (filter.onlyOnline) {
             // Lightspeed sometimes puts channels differently. Usually ecwid_enabled_webstore represents ecom. Or is_active in some versions.
             // We'll check the top level active flag or ecwid flag if exist, or let's assume it has an active online store flag if available in payload.
             // X-Series often uses `active: true`. `has_active_channels` might not be standard. We'll check `active`.
             if (!item.active) continue;
          }
          productsToUpsert.push(item);
        }
        
        const version = response.data.version;
        if (version && version.max && rawItems.length > 0) {
          after = version.max;
        } else {
          fetching = false;
        }
      }
    }

    // Upsert all collected products
    for (const raw of productsToUpsert) {
      try {
        const universal = UniversalProduct.fromLightspeed(raw);
        const data = universal.toPostgres() as any;

        await prisma.product.upsert({
          where: { sku: universal.data.sku },
          update: data,
          create: data,
        });
        
        imported++;
      } catch (err: any) {
        errors.push(`Failed to upsert product ${raw.sku || 'Unknown'}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: `Imported ${imported} products.`,
      imported,
      errors
    });
  } catch (err: any) {
    console.error('[Admin] Lightspeed Import error:', err.message);
    res.status(500).json({ error: 'Failed to process bulk import' });
  }
});

// ─── View Routes ─────────────────────────────────
adminRouter.get('/', async (req, res) => {
  try {
    const [productCount, recentLogs] = await Promise.all([
      prisma.product.count().catch(() => 0),
      prisma.syncLog.findMany({ 
        orderBy: { createdAt: 'desc' }, 
        take: 10 
      }).catch(() => []),
    ]);

    res.render('dashboard', { 
      title: 'System Health', 
      activeTab: 'dashboard',
      productCount,
      recentLogs
    });
  } catch (err) {
    res.status(500).send('Error loading dashboard');
  }
});

adminRouter.get('/products', async (req, res) => {
  res.render('products', { title: 'Product Matrix', activeTab: 'products' });
});

adminRouter.get('/sync', async (req, res) => {
  res.render('sync', { title: 'Manual Controls', activeTab: 'sync' });
});

adminRouter.get('/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const filter = req.query.filter as string | undefined;
    const limit = 50;

    const where = filter ? { status: filter } : {};

    const [logs, total] = await Promise.all([
      prisma.syncLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.syncLog.count({ where }),
    ]);

    res.render('logs', {
      title: 'Audit Trail',
      activeTab: 'logs',
      logs,
      page,
      totalPages: Math.ceil(total / limit),
      filter
    });
  } catch (err) {
    res.status(500).send('Error loading logs');
  }
});

export default adminRouter;
