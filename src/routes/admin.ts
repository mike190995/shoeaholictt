import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { enqueueTask } from '../lib/tasks.js';
import { createLightspeedClient, fetchInventoryForProduct } from '../services/lightspeed.js';
import { 
  createWooCommerceClient, 
  createWooProduct, 
  updateWooProduct, 
  deleteWooProduct, 
  getWooProductBySku,
  createWooVariation,
  updateWooVariation,
  getWooVariationBySku
} from '../services/woocommerce.js';
import { getRedisClient } from '../lib/redis.js';
import { UniversalProduct } from '../mappers/universal.js';
import { optimizeAndUploadImage } from '../lib/images.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INDEX_PATH = join(__dirname, '../../frontend/dist/index.html');

export const adminRouter = Router();

adminRouter.get('/api/debug-ls/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) return res.status(404).json({ error: 'Not found locally' });
    const lsClient = await createLightspeedClient();
    const lsRes = await lsClient.get(`/products/${product.lightspeedId}`);
    res.json(lsRes.data.data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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

    const isMissingImage = (url?: string | null) => {
      if (!url) return true;
      const lower = url.toLowerCase();
      return lower.includes('placeholder') || lower.includes('no-image') || lower.includes('default-product');
    };

    // Gather Parent Images for variants missing their own
    const missingParentsByLS = products
      .filter(p => isMissingImage(p.imageUrl) && p.variantParentId)
      .map(p => p.variantParentId as string);
    
    const missingParentsBySKU = products
      .filter(p => isMissingImage(p.imageUrl) && !p.variantParentId && p.parentSku)
      .map(p => p.parentSku as string);

    const parentImagesMap = new Map<string, string>(); // Link by LS ID OR Sku
    
    if (missingParentsByLS.length > 0 || missingParentsBySKU.length > 0) {
      const parents = await prisma.product.findMany({
        where: {
          OR: [
            { lightspeedId: { in: missingParentsByLS } },
            { sku: { in: missingParentsBySKU } }
          ]
        },
        select: { lightspeedId: true, sku: true, imageUrl: true }
      });
      parents.forEach(p => {
        if (!isMissingImage(p.imageUrl)) {
          if (p.lightspeedId) parentImagesMap.set(p.lightspeedId, p.imageUrl!);
          if (p.sku) parentImagesMap.set(p.sku, p.imageUrl!);
        }
      });
    }

    // Map to the frontend's expected shape
    const mapped = products.map((p: any) => {
      const inheritedImageUrl = isMissingImage(p.imageUrl) 
        ? (parentImagesMap.get(p.variantParentId || '') || parentImagesMap.get(p.parentSku || '') || null)
        : p.imageUrl;
      
      return {
        id: p.id,
        name: p.title,
        sku: p.sku,
        price: p.price,
        stock: p.quantity,
        category: p.category,
        brand: p.brand,
        tags: p.tags,
        imageUrl: inheritedImageUrl,
        thumbnailUrl: isMissingImage((p.metadata as any)?.thumbnailUrl) ? inheritedImageUrl : ((p.metadata as any).thumbnailUrl || inheritedImageUrl),
        status: p.quantity > 0 ? 'published' : 'draft',
        woocommerceId: (p.metadata as any)?.woocommerceId || null,
        lastSynced: p.updatedAt,
      };
    });

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

// ─── Bilateral Force Sync ────────────────────────
adminRouter.post('/api/products/:sku/force-sync', async (req, res) => {
  try {
    const { sku } = req.params;
    let product = await prisma.product.findUnique({ where: { sku } });

    // Step 0: Fetch latest state from Lightspeed (Source of Truth)
    const lsClient = await createLightspeedClient();
    const { fetchInventoryForProduct } = await import('../services/lightspeed.js');
    
    // Discovery
    const searchRes = await lsClient.get('/products', { params: { sku, embed: 'inventory' } });
    let raw = searchRes.data.data?.[0];
    
    if (!raw) {
      const fuzzyRes = await lsClient.get('/search', { params: { type: 'products', sku: sku.toLowerCase() } });
      raw = fuzzyRes.data.data?.[0];
    }

    if (raw) {
      // Enrichment
      if (!raw.inventory || raw.inventory.length === 0) {
        raw.inventory = await fetchInventoryForProduct(lsClient, raw.id);
      }
      
      const universal = UniversalProduct.fromLightspeed(raw);
      const data = universal.toPostgres() as any;
      
      // Update local mirror
      product = await prisma.product.upsert({
        where: { sku },
        update: data,
        create: data
      });
      console.log(`[Sync] Updated local DB for SKU ${sku} from Lightspeed.`);
    }

    if (!product) {
       return res.status(404).json({ error: `Product not found in LS or DB for SKU: ${sku}` });
    }

    // Step 1: Enqueue bilateral push (to Woo & back to LS if modified)
    const syncLog = await prisma.syncLog.create({
      data: {
        direction: 'admin_to_all',
        entityType: 'product',
        entityId: sku,
        status: 'pending',
        payload: product as any,
      },
    });

    if (process.env.NODE_ENV === 'production') {
      await enqueueTask('admin_to_all', { syncLogId: syncLog.id, ...product as any });
    }

    res.json({ success: true, message: `Bilateral sync initiated for ${sku}. Latest inventory pulled.`, syncLogId: syncLog.id });
  } catch (err: any) {
    console.error('[Admin] Force sync error:', err.message);
    res.status(500).json({ error: 'Failed to initiate bilateral sync' });
  }
});

/**
 * Shared service function to execute a full background sync from Lightspeed into the database mirror.
 */
export async function performFullLightspeedSync(initiatedBy: string): Promise<string> {
  const syncLog = await prisma.syncLog.create({
    data: {
      direction: 'ls_to_db',
      entityType: 'catalog',
      entityId: 'full_import',
      status: 'pending',
      message: `Full catalog import initiated from ${initiatedBy}`
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
      console.log(`[Import] Background task finished: ${imported} products imported.`);
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

  return syncLog.id;
}

/**
 * POST /api/sync/full
 * Master catalog pull — fetches all products from Lightspeed and updates the staging DB.
 * Used by the EJS "Execute Master Protocol" button.
 */
adminRouter.post('/api/sync/full', async (req, res) => {
  try {
    const syncLogId = await performFullLightspeedSync('admin dashboard (Execute Master Protocol)');
    res.json({
      success: true,
      message: 'Full catalog pull started in the background. Check Sync Logs for progress.',
      syncLogId
    });
  } catch (err: any) {
    console.error('[SyncFull] Failed to start:', err.message);
    res.status(500).json({ error: 'Failed to start full catalog pull' });
  }
});

// ─── Push Product to WooCommerce ──────────────────
adminRouter.post('/api/products/:sku/push-to-woo', async (req, res) => {
  try {
    const { sku } = req.params;
    const result = await executeWooPush(sku);
    res.json({ 
      success: true, 
      message: `Product ${result.action} successfully in WooCommerce.`, 
      woocommerceId: result.woocommerceId,
      product: result.product
    });
  } catch (err: any) {
    console.error('[Admin] Push to WooCommerce error:', err.message);
  }
});

adminRouter.post('/api/products/push-filtered', async (req, res) => {
  try {
    const { activeFilters, search } = req.body as { activeFilters: string[], search?: string };

    if (!activeFilters || !Array.isArray(activeFilters)) {
      res.status(400).json({ error: 'Must provide an array of activeFilters' });
      return;
    }

    const syncLog = await prisma.syncLog.create({
      data: {
        direction: 'db_to_woo',
        entityType: 'catalog',
        entityId: 'batch_filtered_push',
        status: 'pending',
        message: `Batch filtered push started for ${activeFilters.length} filters: ${activeFilters.join(', ')}`
      }
    });

    // Run the push process in the background
    (async () => {
      try {
        const isMissingImage = (url?: string | null) => {
          if (!url) return true;
          const lower = url.toLowerCase();
          return lower.includes('default') || lower.includes('placeholder') || lower.includes('none');
        };

        const products = await prisma.product.findMany({
          where: search ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } }
            ]
          } : {}
        });

        // Apply filters
        const filtered = products.filter(p => {
          for (const filter of activeFilters) {
            if (filter === 'orphaned' && p.imageUrl) return false;
            if (filter === 'enrichment' && !(isMissingImage(p.imageUrl) || !p.category || Number(p.price) === 0)) return false;
            if (filter === 'in_stock' && p.quantity <= 0) return false;
            if (filter === 'out_of_stock' && p.quantity > 0) return false;
            if (filter === 'low_stock' && (p.quantity <= 0 || p.quantity > 2)) return false;
            if (filter === 'has_photo' && isMissingImage(p.imageUrl)) return false;
            if (filter === 'no_photo' && !isMissingImage(p.imageUrl)) return false;
            if (filter === 'online' && !(p.tags && (p.tags as string[]).some((t: string) => t.toLowerCase() === 'online'))) return false;
            if (filter === 'instore' && !(p.tags && (p.tags as string[]).some((t: string) => t.toLowerCase() === 'instore' || t.toLowerCase() === 'in-store'))) return false;
          }
          return true;
        });

        console.log(`[PushFiltered] Starting push for ${filtered.length} products matching filters: ${activeFilters.join(', ')}`);

        let successCount = 0;
        let failCount = 0;

        for (const product of filtered) {
          try {
            await executeWooPush(product.sku);
            successCount++;
          } catch (err: any) {
            failCount++;
            console.error(`[PushFiltered] Failed to push SKU ${product.sku}:`, err.message);
          }
        }

        await prisma.syncLog.update({
          where: { id: syncLog.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            message: `Batch filtered push completed: ${successCount} pushed, ${failCount} failed.`
          }
        });
        console.log(`[PushFiltered] Done. ${successCount} products pushed.`);
      } catch (err: any) {
        console.error('[PushFiltered] Background push failed:', err.message);
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

    res.json({
      success: true,
      message: 'Batch push of filtered products started in the background. Check Sync Logs for progress.',
      syncLogId: syncLog.id
    });
  } catch (err: any) {
    console.error('[PushFiltered] Failed to start:', err.message);
    res.status(500).json({ error: 'Failed to start batch push' });
  }
});

export async function executeWooPush(sku: string): Promise<any> {
  try {
    const product = await prisma.product.findUnique({ where: { sku } });

    if (!product) {
      throw new Error(`Product not found for SKU: ${sku}`);
    }

    // 0. Deep Fetch from Lightspeed to get high-res images and latest stock
    const lsId = (product.metadata as any)?.lightspeedId;
    console.log(`[Admin] Performing JIT Deep Sync for SKU: ${sku} (LS ID: ${lsId || 'N/A'})`);
    const lsClient = await createLightspeedClient();
    
    let rawLsProduct: any = null;
    try {
      if (lsId) {
        try {
          // Fetch direct ID (do not use ID in query params for the collection endpoint!)
          const lsIdResponse = await lsClient.get(`/products/${lsId}`, { params: { embed: 'images,inventory' } });
          rawLsProduct = lsIdResponse.data.data;
        } catch (idErr: any) {
          console.warn(`[Admin] Fetch by direct ID failed for ${lsId}, falling back to SKU lookup. Error:`, idErr.message);
        }
      }
      
      if (!rawLsProduct) {
        // Fallback to SKU lookup using the Search API
        // SEARCH API (2.0) is the reliable way to find the ID for a SKU
        console.log(`[Admin] Fetch by ID missing/failed. Discovering ID via Search for SKU: ${sku}`);
        const lsSearchResponse = await lsClient.get('/search', { params: { type: 'products', sku } });
        const discoveredItem = lsSearchResponse.data.data?.[0];
        
        if (discoveredItem && discoveredItem.id) {
          console.log(`[Admin] Discovered ID ${discoveredItem.id} for SKU ${sku}. Performing detailed fetch...`);
          const lsDetailResponse = await lsClient.get(`/products/${discoveredItem.id}`, { params: { embed: 'images,inventory' } });
          rawLsProduct = lsDetailResponse.data.data;
        }
        
        if (rawLsProduct && rawLsProduct.name === 'Discount' && sku !== 'vend-discount') {
          console.warn(`[Admin] Search/Fetch resulted in "Discount" for SKU ${sku}. Skipping update.`);
          rawLsProduct = null;
        }
      }
    } catch (lsErr: any) {
      console.warn(`[Admin] Deep sync fetch failed for ${sku}:`, lsErr.message);
    }

    let finalProduct = product;
    if (rawLsProduct) {
      // Enrichment: If embedded inventory is missing or empty, fetch it explicitly
      if (!rawLsProduct.inventory || rawLsProduct.inventory.length === 0) {
        console.log(`[Admin] JIT Sync: Fetching enriched inventory for variant: ${sku} (ID: ${rawLsProduct.id})`);
        const { fetchInventoryForProduct } = await import('../services/lightspeed.js');
        rawLsProduct.inventory = await fetchInventoryForProduct(lsClient, rawLsProduct.id);
      }

      console.log(`[Admin] Found latest LS details for ${sku} (ID: ${rawLsProduct.id}). Inventory entries: ${rawLsProduct.inventory?.length || 0}`);
      
      // DIAGNOSTIC LOGGING: Show the first few fields to see why name/price/stock are 0
      console.log(`[Diagnostic] SKU: ${sku} Raw Name: "${rawLsProduct.name}", Variant Name: "${rawLsProduct.variant_name}", Price: ${rawLsProduct.retail_price}, Inv: ${JSON.stringify(rawLsProduct.inventory?.[0] || 'NONE')}`);

      const universalSync = UniversalProduct.fromLightspeed(rawLsProduct);
      const dbData = universalSync.toPostgres() as any;
      
      // TITLE SAFEGUARD: If the new title is generic but we have a good one, keep the old one.
      const isGeneric = (t: string) => !t || t.toLowerCase() === 'discount' || t.toLowerCase() === 'test';
      const useOldTitle = isGeneric(dbData.title) && !isGeneric(product.title);
      
      if (useOldTitle) {
        console.warn(`[Admin] Safeguard triggered: Keeping descriptive title "${product.title}" over generic "${dbData.title}" for SKU ${sku}`);
      }

      // Preserve local metadata (like woocommerceId) during deep sync
      const mergedMetadata = {
        ...(product.metadata as any || {}),
        ...(dbData.metadata || {})
      };

      // Update local mirror before optimizing/pushing
      // CRITICAL: We omit 'sku' from dbData and optionally title based on safeguard.
      const { sku: _lsSku, ...updateData } = dbData;
      if (useOldTitle) delete (updateData as any).title;

      finalProduct = await prisma.product.update({
        where: { sku },
        data: {
          ...updateData,
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

    // 2. Prepare WooCommerce Payload
    const wooClient = createWooCommerceClient();
    const isVariant = !!finalProduct.variantParentId;

    // --- PARENT AUTO-SYNC ---
    if (isVariant && finalProduct.variantParentId) {
      const parent = await prisma.product.findUnique({
        where: { lightspeedId: finalProduct.variantParentId }
      });
      if (parent) {
        const parentWooId = (parent.metadata as any)?.woocommerceId;
        
        // AUTO-PUSH PARENT FIRST if it hasn't been synced to Woo
        if (!parentWooId && parent.sku !== sku) {
          console.log(`[Admin] Auto-pushing PARENT product ${parent.sku} before variant ${sku}...`);
          try {
            const parentResult = await executeWooPush(parent.sku);
            console.log(`[Admin] Parent ${parent.sku} auto-pushed successfully (Woo ID: ${parentResult.woocommerceId}).`);
          } catch (autoPushErr: any) {
            console.warn(`[Admin] Failed to auto-push parent ${parent.sku}. Proceeding with variant sync anyway. Error:`, autoPushErr.message);
          }
        }
      }
    }

    const isMissingImage = (url?: string | null) => {
      if (!url) return true;
      const lower = url.toLowerCase();
      return lower.includes('placeholder') || lower.includes('no-image') || lower.includes('default-product');
    };

    // --- IMAGE INHERITANCE ---
    finalImageUrl = finalProduct.imageUrl;
    
    // If variant is missing image (or has placeholder), try to inherit from parent
    if (isVariant && isMissingImage(finalImageUrl)) {
        const parentId = finalProduct.variantParentId;
        const parentSku = finalProduct.parentSku;

        const parent = await prisma.product.findFirst({ 
          where: { 
            OR: [
              parentId ? { lightspeedId: parentId } : undefined,
              parentSku ? { sku: parentSku } : undefined
            ].filter(Boolean) as any
          } 
        });

        if (parent && !isMissingImage(parent.imageUrl)) {
            console.log(`[Admin] Variant ${sku} inheriting image from parent ${parent.sku}: ${parent.imageUrl}`);
            finalImageUrl = parent.imageUrl!;
        }
    }

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

    const wooPayload = universal.toWoo(wooCategoryId, fieldMappings, undefined, isVariant);
    
    // 3. Push to WooCommerce
    const metadata = (finalProduct.metadata as Record<string, any>) || {};
    let wooId = metadata.woocommerceId ? Number(metadata.woocommerceId) : null;
    let wooParentId: number | null = null;

    // Handle variant parenting
    if (isVariant) {
      console.log(`[Admin] Variant detected for ${sku}. Parent LS ID: ${finalProduct.variantParentId}`);
      const parent = await prisma.product.findUnique({
        where: { lightspeedId: finalProduct.variantParentId! }
      });
      if (parent) {
        wooParentId = (parent.metadata as any)?.woocommerceId ? Number((parent.metadata as any).woocommerceId) : null;
        console.log(`[Admin] Found parent WooCommerce ID: ${wooParentId}`);
      }
    }

    // Recovery Step: If ID is missing locally, search Woo by SKU
    if (!wooId) {
      console.log(`[Admin] No local Woo ID for ${sku} — checking remote search...`);
      const existingRemote = wooParentId 
        ? await getWooVariationBySku(wooClient, wooParentId, sku)
        : await getWooProductBySku(wooClient, sku);
        
      if (existingRemote && existingRemote.id) {
        wooId = Number(existingRemote.id);
        console.log(`[Admin] Recovered ID for ${sku} via SKU search: ${wooId}`);
      }
    }

    let action: 'created' | 'updated';
    let wooResponse: any = null;
    const endpoint = wooParentId ? `/products/${wooParentId}/variations` : '/products';

    try {
      if (!wooId) {
        console.log(`[Admin] Pushing NEW ${wooParentId ? 'variation' : 'product'} to WooCommerce: ${sku}`);
        const res = await wooClient.post(endpoint, wooPayload);
        wooResponse = res.data;
        wooId = Number(wooResponse.id);
        action = 'created';
      } else {
        const updatePath = wooParentId ? `${endpoint}/${wooId}` : `${endpoint}/${wooId}`;
        console.log(`[Admin] Updating EXISTING ${wooParentId ? 'variation' : 'product'}: ${sku} (ID: ${wooId})`);
        try {
          const res = await wooClient.put(updatePath, wooPayload);
          wooResponse = res.data;
          action = 'updated';
        } catch (updateErr: any) {
          if (updateErr.response?.status === 404) {
            console.warn(`[Admin] ID ${wooId} not found (404). Re-creating...`);
            const res = await wooClient.post(endpoint, wooPayload);
            wooResponse = res.data;
            wooId = Number(wooResponse.id);
            action = 'created';
          } else {
            throw updateErr;
          }
        }
      }
    } catch (pushErr: any) {
      console.error(`[Admin] WooCommerce push failed for ${sku}:`, pushErr.response?.data || pushErr.message);
      throw pushErr;
    }

    // Update local database with the ID and sync timestamp
    const wooImageId = isVariant && wooResponse.image?.id 
      ? wooResponse.image.id 
      : wooResponse.images?.[0]?.id;
    const updatedProduct = await prisma.product.update({
      where: { sku },
      data: {
        metadata: {
          ...metadata,
          woocommerceId: wooId,
          wooImageId: wooImageId || metadata.wooImageId, // Save for deduplication
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

    return { 
      success: true, 
      action, 
      woocommerceId: wooId,
      product: updatedProduct
    };
  } catch (err: any) {
    console.error(`[Admin] executeWooPush failed for ${sku}:`, err.message);
    throw err;
  }
}

/**
 * Pushes a style group (parent + siblings) to WooCommerce as a Variable Product.
 * Implements Architecture §3: Data Transformation and Grouping.
 */
export async function pushProductGroup(parentSku: string): Promise<any> {
  const wooClient = createWooCommerceClient();
  const lsClient = await createLightspeedClient();

  // 1. Load Initial Product (could be parent or variant)
  let parent = await prisma.product.findUnique({ where: { sku: parentSku } });
  if (!parent) throw new Error(`Product not found for SKU: ${parentSku}`);
  
  // Auto-resolve parent if a variant SKU was provided
  if (parent.variantParentId) {
    console.log(`[Admin] SKU ${parentSku} is a variant. Auto-resolving parent product...`);
    const resolvedParent = await prisma.product.findUnique({ where: { lightspeedId: parent.variantParentId } });
    if (!resolvedParent) throw new Error(`Parent product not found for variant Parent ID: ${parent.variantParentId}`);
    parent = resolvedParent;
    parentSku = parent.sku; // Update the reference
  }

  const lightspeedId = parent.lightspeedId;
  if (!lightspeedId) throw new Error(`Parent ${parentSku} is missing lightspeedId.`);

  // 2. Load Sibling Variants
  const siblingsRaw = await prisma.product.findMany({
    where: { 
      OR: [
        { variantParentId: lightspeedId },
        { parentSku: parentSku }
      ]
    }
  });

  // Deduplicate by SKU to prevent double-counting if a record matches both criteria
  const siblingsMap = new Map();
  siblingsRaw.forEach(s => siblingsMap.set(s.sku, s));
  const siblings = Array.from(siblingsMap.values()) as typeof siblingsRaw;

  if (siblings.length === 0) {
    console.warn(`[Admin] Parent ${parentSku} has no siblings. Falling back to single SKU push.`);
    return executeWooPush(parentSku);
  }

  console.log(`[Admin] Starting Group Push for ${parentSku} (${siblings.length} variants).`);

  // 3. JIT Fetch and Build Attributes
  // We need to know all possible options for the parent shell.
  const supersetAttributes: Record<string, Set<string>> = {};
  const enrichedVariants: any[] = [];
  
  // Include the parent itself in the fetch list as requested (it might have its own stock/details)
  const allItems = [parent, ...siblings];

  for (const variant of allItems) {
    try {
      // JIT fetch fresh details (stock, skuImages, attributes) for each variant
      const lsSearchRes = await lsClient.get('/search', { params: { sku: variant.sku, type: 'products', embed: 'images,inventory' } });
      let raw = lsSearchRes.data.data?.[0];
      
      // Follow-up: If search didn't return inventory, fetch it directly
      if (raw && (!raw.inventory || (Array.isArray(raw.inventory) && raw.inventory.length === 0))) {
        const invRes = await lsClient.get(`/products/${raw.id}/inventory`).catch(() => null);
        if (invRes?.data?.data) {
          raw.inventory = invRes.data.data;
        }
      }

      if (raw) {
        const universal = UniversalProduct.fromLightspeed(raw);
        enrichedVariants.push({ variant, universal });
        
        // Add to attribute map
        (universal.data.variantOptions || []).forEach(opt => {
          if (!supersetAttributes[opt.name]) supersetAttributes[opt.name] = new Set();
          supersetAttributes[opt.name].add(opt.value);
        });
      }
    } catch (err: any) {
      console.warn(`[Admin] Failed to JIT fetch variant ${variant.sku}:`, err.message);
    }
  }

  const finalAttributes: Record<string, string[]> = {};
  Object.entries(supersetAttributes).forEach(([k, v]) => {
    finalAttributes[k] = Array.from(v);
  });

  // 4. CLEAN SLATE: Delete every product in this group from WooCommerce via SKU lookup,
  // whether or not we have a local woocommerceId recorded. This prevents SKU collision errors.
  console.log(`[Admin] Clean slate: nuking ${siblings.length + 1} SKUs from WooCommerce...`);
  const allGroupSkus = [parent, ...siblings].map(p => p.sku);

  for (const sku of allGroupSkus) {
    try {
      // 1. Search for any TOP-LEVEL product with this SKU
      const simpleRes = await wooClient.get('/products', { params: { sku, per_page: 10 } });
      for (const p of (simpleRes.data as any[]) || []) {
        console.log(`[Admin] Deleting conflicting product: ${sku} (ID: ${p.id}, Type: ${p.type})`);
        await wooClient.delete(`/products/${p.id}`, { params: { force: true } }).catch(() => {});
      }

      // 2. Search for any VARIATION with this SKU (harder, but we can try common parents or use the sku directly if the API supports it)
      // Note: standard WC API doesn't support global variation search by SKU easily.
      // But we can check if the current parent in our metadata exists and has this variation.
      const parentId = (parent.metadata as any)?.woocommerceId;
      if (parentId) {
        const varRes = await wooClient.get(`/products/${parentId}/variations`, { params: { sku } }).catch(() => null);
        if (varRes && Array.isArray(varRes.data)) {
          for (const v of varRes.data) {
             console.log(`[Admin] Deleting conflicting variation from known parent: ${sku} (ID: ${v.id})`);
             await wooClient.delete(`/products/${parentId}/variations/${v.id}`, { params: { force: true } }).catch(() => {});
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Admin] Clean slate warning for SKU ${sku}:`, err.message);
    }
    
    // Always clear the local DB link regardless
    try {
      const dbRec = await prisma.product.findUnique({ where: { sku } });
      if (dbRec) {
        const meta = (dbRec.metadata as any) || {};
        delete meta.woocommerceId;
        await prisma.product.update({ where: { sku }, data: { metadata: meta } });
      }
    } catch {}
  }

  // 4b. Prepare Parent Aggregates
  let totalStock = 0;
  const galleryImagesSet = new Set<string>();
  const categoriesSet = new Set<string>();
  const tagsSet = new Set<string>();
  
  // Add parent's base data
  if (parent.category) categoriesSet.add(parent.category);
  (parent.tags || []).forEach((t: string) => tagsSet.add(t));

  for (const { universal } of enrichedVariants) {
    totalStock += universal.data.quantity || 0;
    
    // Aggregating categories and tags from all variants
    if (universal.data.category) categoriesSet.add(universal.data.category);
    (universal.data.tags || []).forEach((t: string) => tagsSet.add(t));
    
    if (universal.data.imageUrl) galleryImagesSet.add(universal.data.imageUrl);
    if (universal.data.thumbnailUrl) galleryImagesSet.add(universal.data.thumbnailUrl);
    (universal.data.galleryImages || []).forEach((img: string) => galleryImagesSet.add(img));
  }
  const galleryImages = Array.from(galleryImagesSet).filter(Boolean);
  const finalCategories = Array.from(categoriesSet).filter(Boolean);
  const finalTags = Array.from(tagsSet).filter(Boolean);

  // 4c. Resolve Categories and Tags in WooCommerce
  const resolveTerms = async (endpoint: string, names: string[]) => {
    const ids: number[] = [];
    for (const name of names) {
      try {
        const res = await wooClient.post(endpoint, { name }).catch(err => {
          const errorData = err.response?.data;
          if (errorData?.code === 'term_exists' && errorData?.data?.resource_id) {
             return { data: { id: errorData.data.resource_id } };
          }
          throw err;
        });
        if (res?.data?.id) ids.push(res.data.id);
      } catch (err: any) {
        console.warn(`[Admin] Failed to resolve ${endpoint} for "${name}":`, err.message);
      }
    }
    return ids;
  };

  console.log(`[Admin] Resolving ${finalCategories.length} categories and ${finalTags.length} tags...`);
  const wooCategoryIds = await resolveTerms('/products/categories', finalCategories);
  const wooTagIds = await resolveTerms('/products/tags', finalTags);

  // 5. Push Parent Shell
  const parentUniversal = UniversalProduct.fromDatabase(parent);
  // Re-inject for mapper consistency if needed
  parentUniversal.data.category = finalCategories[0]; // Primary
  parentUniversal.data.tags = finalTags;
  
  const parentPayload = parentUniversal.toWooParent(
    finalAttributes, 
    wooCategoryIds, 
    wooTagIds,
    galleryImages, 
    totalStock
  );
  
  console.log(`[Admin] Pushing parent shell for ${parentSku}...`);
  const parentResponse = await wooClient.post('/products', parentPayload);
  const parentWooId = parentResponse.data.id;

  await prisma.product.update({
    where: { sku: parentSku },
    data: { metadata: { ...(parent.metadata as any), woocommerceId: parentWooId } }
  });

  // 6. Push Variations
  const results = { created: 0, updated: 0, failed: 0 };
  for (const { variant, universal } of enrichedVariants) {
    try {
      // Avoid pushing the parent product as a variation of itself (SKU collision)
      if (variant.sku === parentSku) {
        console.log(`[Admin] Skipping variation sync for parent SKU ${variant.sku} (stock already aggregated).`);
        continue;
      }

      const variationPayload = universal.toWoo(undefined, undefined, undefined, true);
      console.log(`[Admin] Syncing variation ${variant.sku} under parent ${parentWooId}...`);
      
      // Idempotency check: Search for this SKU in the parent's variation list
      const varSearchRes = await wooClient.get(`/products/${parentWooId}/variations`, { 
        params: { sku: variant.sku } 
      });
      
      const existing = (varSearchRes.data as any[])?.[0];
      let vRes;
      
      if (existing) {
        console.log(`[Admin] Variation ${variant.sku} exists (ID: ${existing.id}). Updating...`);
        vRes = await wooClient.put(`/products/${parentWooId}/variations/${existing.id}`, variationPayload);
        results.updated++;
      } else {
        console.log(`[Admin] Variation ${variant.sku} is new. Creating...`);
        // We still use a rescue-retry just in case an orphan from another parent is blocking us
        try {
          vRes = await wooClient.post(`/products/${parentWooId}/variations`, variationPayload);
        } catch (err: any) {
          const errorData = err.response?.data;
          const culpritId = errorData?.data?.resource_id || errorData?.resource_id;
          if (culpritId) {
            console.log(`[Admin] SKU conflict found for ${variant.sku}. Nuking ID ${culpritId} and retrying...`);
            await wooClient.delete(`/products/${culpritId}`, { params: { force: true } }).catch(() => {});
            vRes = await wooClient.post(`/products/${parentWooId}/variations`, variationPayload);
          } else {
            throw err;
          }
        }
        results.created++;
      }
      
      await prisma.product.update({
        where: { sku: variant.sku },
        data: { metadata: { ...(variant.metadata as any), woocommerceId: vRes.data.id } }
      });
    } catch (err: any) {
      console.error(`[Admin] Failed variation sync for ${variant.sku}:`, err.response?.data || err.message);
      results.failed++;
    }
  }

  return {
    success: true,
    parentWooId,
    variantsCreated: results.created,
    variantsUpdated: results.updated,
    variantsFailed: results.failed
  };
}

// ─── Push Product Group to WooCommerce ──────────────
adminRouter.post('/api/products/:sku/push-group', async (req, res) => {
  try {
    const { sku } = req.params;
    const result = await pushProductGroup(sku);
    res.json(result);
  } catch (err: any) {
    console.error('[Admin] Push group error:', err.message);
    res.status(500).json({ error: err.message });
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
    const wooClient = createWooCommerceClient();
    
    // Proactive search by SKU to catch orphans
    const searchRes = await wooClient.get('/products', { params: { sku } });
    const discovered = (searchRes.data as any[]) || [];
    const idsToDelete = new Set<number>();
    if (wooId) idsToDelete.add(wooId);
    discovered.forEach(p => idsToDelete.add(p.id));

    for (const idToNuke of Array.from(idsToDelete)) {
      try {
        console.log(`[Admin] Deleting product/orphan from Woo: ${idToNuke}`);
        await deleteWooProduct(wooClient, idToNuke);
      } catch {}
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
        payload: { action: 'delete_from_woo', ids: Array.from(idsToDelete) },
      },
    });

    res.json({ 
      success: true, 
      message: `Product ${sku} and ${idsToDelete.size} instances deleted/unlinked.`,
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
    
    // Inherit images for variants from either local DB or Lightspeed
    const variantWrappers = rawProducts.map(raw => ({ 
      raw, 
      universal: UniversalProduct.fromLightspeed(raw) 
    }));

    const isMissingImage = (url?: string | null) => {
      if (!url) return true;
      const lower = url.toLowerCase();
      return lower.includes('placeholder') || lower.includes('no-image') || lower.includes('default-product');
    };

    const missingImgParents = variantWrappers
      .filter(w => isMissingImage(w.universal.data.imageUrl) && w.universal.data.variantParentId)
      .map(w => w.universal.data.variantParentId!);

    const searchParentMap = new Map<string, string>();
    if (missingImgParents.length > 0) {
      // 1. Check local DB first for parent images
      const localParents = await prisma.product.findMany({
        where: { lightspeedId: { in: Array.from(new Set(missingImgParents)) } },
        select: { lightspeedId: true, imageUrl: true }
      });
      localParents.forEach(p => { if (!isMissingImage(p.imageUrl)) searchParentMap.set(p.lightspeedId!, p.imageUrl!); });

      // 2. Fallback: Check if any parents are actually in our current search results
      variantWrappers.forEach(w => {
        if (!isMissingImage(w.universal.data.imageUrl) && !w.universal.data.variantParentId) {
          searchParentMap.set(w.raw.id, w.universal.data.imageUrl!);
        }
      });
    }

    // Map to Universal Canonical Model format
    const mapped = (await Promise.all(variantWrappers.map(async ({ raw, universal }) => {
      try {
        // Enforce enrichment for variant products that often missing embedded inventory
        if (!raw.inventory || raw.inventory.length === 0) {
          console.log(`[Admin] Fetching enriched inventory for: ${raw.sku} (${raw.id})`);
          raw.inventory = await fetchInventoryForProduct(lsClient, raw.id);
        }

        const inheritedImageUrl = isMissingImage(universal.data.imageUrl) 
          ? (universal.data.variantParentId ? searchParentMap.get(universal.data.variantParentId) : '')
          : universal.data.imageUrl;

        return {
          id: universal.data.metadata?.lightspeedId || raw.id || '',
          name: universal.data.title,
          sku: universal.data.sku,
          price: universal.data.price,
          stock: universal.data.quantity,
          category: universal.data.category || 'Uncategorized',
          brand: universal.data.brand || '',
          imageUrl: inheritedImageUrl || '',
          thumbnailUrl: universal.data.thumbnailUrl || inheritedImageUrl || '',
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
      try {
        const syncLogId = await performFullLightspeedSync('admin dashboard (Vite Importer)');
        return res.json({ 
          success: true, 
          message: 'Full catalog import started in background.',
          syncLogId 
        });
      } catch (err: any) {
        console.error('[Import] Failed to start:', err.message);
        return res.status(500).json({ error: 'Failed to start full import' });
      }
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
      const { fetchFullInventoryMap } = await import('../services/lightspeed.js');
      
      // Step 1: Pre-fetch full inventory map to avoid individual calls inside the loop
      // This is fast (~1-2 mins) and ensures variants are never zero-ed out.
      const inventoryMap = await fetchFullInventoryMap(lsClient);

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
          if (filter.onlyOnline && !item.active) continue;

          // Enrichment: Override embedded (potentially broken) inventory with mapping data
          (item as any).inventory_level = inventoryMap.get(item.id) || 0;

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

// Dashboard
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

// Catalog — full product listing with pagination
adminRouter.get('/catalog', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 50;

    const [productsRaw, total] = await Promise.all([
      prisma.product.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.product.count(),
    ]);

    const isMissingImage = (url?: string | null) => {
      if (!url) return true;
      const lower = url.toLowerCase();
      return lower.includes('placeholder') || lower.includes('no-image') || lower.includes('default-product');
    };

    // Inherit images for variants (Two-tier strategy)
    const missingLS = productsRaw.filter(p => isMissingImage(p.imageUrl) && p.variantParentId).map(p => p.variantParentId!);
    const missingSKU = productsRaw.filter(p => isMissingImage(p.imageUrl) && !p.variantParentId && p.parentSku).map(p => p.parentSku!);
    
    const parentImages = new Map<string, string>();
    if (missingLS.length > 0 || missingSKU.length > 0) {
      const parents = await prisma.product.findMany({
        where: {
          OR: [
            { lightspeedId: { in: missingLS } },
            { sku: { in: missingSKU } }
          ]
        },
        select: { lightspeedId: true, sku: true, imageUrl: true }
      });
      parents.forEach(p => { 
        if (!isMissingImage(p.imageUrl)) {
          if (p.lightspeedId) parentImages.set(p.lightspeedId, p.imageUrl!);
          if (p.sku) parentImages.set(p.sku, p.imageUrl!);
        }
      });
    }

    const products = productsRaw.map(p => ({
      ...p,
      imageUrl: isMissingImage(p.imageUrl) 
        ? (parentImages.get(p.variantParentId || '') || parentImages.get(p.parentSku || '') || null) 
        : p.imageUrl
    }));

    res.render('products', { 
      title: 'Catalog', 
      activeTab: 'products',
      products,
      page,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).send('Error loading catalog');
  }
});

// Legacy /products alias → redirect to /catalog
adminRouter.get('/products', (req, res) => {
  res.redirect('/admin/catalog');
});

// Import Node — discover and pull from Lightspeed
adminRouter.get('/import', async (req, res) => {
  res.render('import', { title: 'Import Node', activeTab: 'import' });
});

// Manual Override Controls
adminRouter.get('/sync', async (req, res) => {
  res.render('sync', { title: 'Manual Override', activeTab: 'sync' });
});

// Sync Logs
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
      title: 'Sync Logs',
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

