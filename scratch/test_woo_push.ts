import { prisma } from '../src/lib/prisma.js';
import { createLightspeedClient } from '../src/services/lightspeed.js';
import { 
  createWooCommerceClient, 
  getWooProductBySku, 
  getWooVariationBySku,
  updateWooProduct,
  createWooVariation,
  updateWooVariation
} from '../src/services/woocommerce.js';
import { UniversalProduct } from '../src/mappers/universal.js';

async function run() {
  const wooClient = createWooCommerceClient();
  const sku = '14342';

  try {
    console.log(`[Diagnostic] Fetching SKU ${sku} from local database...`);
    const dbProduct = await prisma.product.findUnique({ where: { sku } });
    
    if (!dbProduct) {
      console.log(`[Diagnostic] Product not found in local DB.`);
      return;
    }

    console.log(`[Diagnostic] Data in DB: Title="${dbProduct.title}", ParentID="${dbProduct.variantParentId}"`);
    
    const isVariant = !!dbProduct.variantParentId;
    let wooParentId: number | null = null;

    if (isVariant) {
      const parent = await prisma.product.findUnique({
        where: { lightspeedId: dbProduct.variantParentId! }
      });
      if (parent) {
        wooParentId = (parent.metadata as any)?.woocommerceId ? Number((parent.metadata as any).woocommerceId) : null;
        console.log(`[Diagnostic] Found parent WooCommerce ID: ${wooParentId}`);
      } else {
        console.log(`[Diagnostic] Parent product not found for parent ID: ${dbProduct.variantParentId}`);
      }
    }

    const universal = UniversalProduct.fromDatabase(dbProduct);
    const wooPayload = universal.toWoo();
    console.log(`[Diagnostic] Computed Woo Payload:`, JSON.stringify(wooPayload, null, 2));

    const metadata = (dbProduct.metadata as any) || {};
    let wooId = metadata.woocommerceId ? Number(metadata.woocommerceId) : null;
    
    if (!wooId) {
      console.log(`[Diagnostic] No local Woo ID, checking remote search...`);
      const existingRemote = wooParentId 
        ? await getWooVariationBySku(wooClient, wooParentId, sku)
        : await getWooProductBySku(wooClient, sku);
        
      if (existingRemote && existingRemote.id) {
        wooId = Number(existingRemote.id);
        console.log(`[Diagnostic] Recovered ID via SKU search: ${wooId}`);
      }
    }

    console.log(`[Diagnostic] Preparing to push. Target Endpoint: ${wooParentId ? `/products/${wooParentId}/variations` : '/products'}, ID: ${wooId}`);
    
    if (!wooId) {
      const res = await wooClient.post(wooParentId ? `/products/${wooParentId}/variations` : '/products', wooPayload);
      console.log(`[Diagnostic] Success! Created ID:`, res.data.id);
    } else {
      const path = wooParentId ? `/products/${wooParentId}/variations/${wooId}` : `/products/${wooId}`;
      const res = await wooClient.put(path, wooPayload);
      console.log(`[Diagnostic] Success! Updated ID:`, res.data.id);
    }

  } catch (err: any) {
    console.error(`[Diagnostic] API Error:`, err.response?.data || err.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
