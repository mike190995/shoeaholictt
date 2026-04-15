import { createLightspeedClient } from '../src/services/lightspeed.js';
import { UniversalProduct } from '../src/mappers/universal.js';

async function testSearchLogic() {
  try {
    const lsClient = await createLightspeedClient();
    
    // Test the extractProducts helper as it's defined in admin.ts
    const extractProducts = (res: any) => {
      const body = res?.data;
      if (!body) return [];
      if (Array.isArray(body.data)) return body.data;
      if (body.data && typeof body.data === 'object' && body.data.id) return [body.data];
      if (Array.isArray(body)) return body;
      if (typeof body === 'object' && body.id) return [body];
      return [];
    };

    console.log('[Test] Running empty search (browse all)...');
    
    // Simulate empty search
    const params: any = { page_size: 50, embed: 'inventory' };
    const response = await lsClient.get('/products', { params });
    
    const rawProducts = extractProducts(response);
    
    console.log(`[Test] Extracted ${rawProducts.length} raw products. Type:`, typeof rawProducts, 'IsArray:', Array.isArray(rawProducts));
    
    if (rawProducts.length > 0) {
      console.log('[Test] First raw product keys:', Object.keys(rawProducts[0]));
      
      const mapped = rawProducts.map((raw: any) => {
        try {
          const universal = UniversalProduct.fromLightspeed(raw);
          return {
            id: universal.data.metadata?.lightspeedId || raw.id || '',
            name: universal.data.title,
            sku: universal.data.sku,
            price: universal.data.price
          };
        } catch (mapErr: any) {
          console.warn('[Admin] Failed to map product:', raw.id, mapErr.message);
          return null;
        }
      }).filter(Boolean);
      
      console.log(`[Test] Successfully mapped ${mapped.length} products`);
      if (mapped.length > 0) console.log('[Test] First mapped product:', mapped[0]);
    } else {
      console.log('[Test] No products returned to map.');
    }
  } catch (err: any) {
    console.error('[Test] TRAGIC ERROR:', err.message);
    if (err.response?.data) console.error(err.response.data);
    console.error(err.stack);
  }
}

testSearchLogic();
