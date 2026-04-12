import { z } from 'zod';

/**
 * Zod schema for the Universal Product — the Canonical Data Model
 * that sits between all platform-specific formats (Architecture §3).
 *
 * Every transformation goes through this:
 *   Lightspeed JSON → UniversalProduct → WooCommerce JSON
 *   WooCommerce JSON → UniversalProduct → Lightspeed JSON
 */
const UniversalProductSchema = z.object({
  sku: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  quantity: z.number().int().nonnegative(),
  category: z.string().optional(),
  imageUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  galleryImages: z.array(z.string().url()).optional(),
  variantParentId: z.string().optional(),
  handle: z.string().optional(),
  brand: z.string().optional(),
  tags: z.array(z.string()).optional(),
  variantOptions: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UniversalProductData = z.infer<typeof UniversalProductSchema>;

/**
 * UniversalProduct — The Canonical Data Model.
 *
 * All data transformations between Lightspeed, WooCommerce, PostgreSQL,
 * and the Custom Site go through this class to avoid spaghetti code.
 */
export class UniversalProduct {
  public readonly data: UniversalProductData;

  private constructor(data: UniversalProductData) {
    this.data = data;
  }

  // ─── Ingress: Platform → Universal ───────────

  /**
   * Transforms a Lightspeed X-Series (Vend) product into a UniversalProduct.
   * X-Series format: { id, sku, handle, price, inventory: { count }, ... }
   */
  static fromLightspeed(raw: Record<string, unknown>): UniversalProduct {
    return new UniversalProduct({
      sku: (raw.sku || raw.handle || String(raw.id)) as string,
      title: (raw.name || raw.variant_name || '') as string,
      description: (raw.description || '') as string,
      price: parseFloat(String(raw.retail_price || raw.price || raw.price_including_tax || raw.price_excluding_tax || 0)),
      quantity: (() => {
        // 1. Primary Strategy: Sum up the detailed inventory array if it exists.
        // Detailed outlet data is the single source of truth for variants and multi-location setups.
        if (Array.isArray(raw.inventory) && raw.inventory.length > 0) {
          return raw.inventory.reduce((sum: number, inv: any) => {
            // Available = On Hand (inventory_level) MINUS Committed (committed_count)
            const onHand = parseFloat(String(inv.inventory_level ?? inv.current_amount ?? inv.count ?? 0));
            const committed = parseFloat(String(inv.committed_count || 0));
            const available = Math.max(0, onHand - committed);
            
            return sum + Math.floor(available);
          }, 0);
        }

        // 2. Fallback: Trust the top-level summary provided by Lightspeed IF the array is missing.
        const summaryCount = raw.inventory_level ?? raw.inventory_count ?? raw.count ?? (raw as any).total_inventory_level;
        if (summaryCount !== undefined) {
          return Math.max(0, Math.floor(parseFloat(String(summaryCount))));
        }

        return 0;
      })(),
      category: typeof raw.type === 'object' && raw.type !== null 
        ? (raw.type as any).name 
        : (raw.type as string) || undefined,
      imageUrl: (() => {
        const variantImg = (raw.image_url || raw.image_thumbnail_url) as string;
        const isValid = (img: string) => img && !img.includes('placeholder') && !img.includes('no-image');
        
        if (isValid(variantImg)) return variantImg;
        
        if (Array.isArray(raw.images) && raw.images.length > 0) {
          const firstImg = raw.images[0];
          const url = (typeof firstImg === 'object' && firstImg !== null) ? (firstImg as any).url : String(firstImg);
          if (isValid(url)) return url;
        }
        return undefined;
      })(),
      galleryImages: (() => {
        const gallery: string[] = [];
        const isValid = (img: string) => img && !img.includes('placeholder') && !img.includes('no-image');
        
        if (Array.isArray(raw.images)) {
          for (const img of raw.images) {
            const url = (typeof img === 'object' && img !== null) ? (img as any).url : String(img);
            if (isValid(url)) gallery.push(url);
          }
        }
        return gallery;
      })(),
      thumbnailUrl: (raw.image_thumbnail_url as string) || undefined,
      variantParentId: (raw.variant_parent_id as string) || undefined,
      handle: (raw.handle as string) || undefined,
      brand: typeof raw.brand === 'object' && raw.brand !== null ? (raw.brand as any).name : (raw.brand as string) || undefined,
      tags: Array.isArray(raw.tags) 
        ? raw.tags.map((t: any) => typeof t === 'object' ? t.name : String(t))
        : (raw.tags as string)?.split(',').map(t => t.trim()).filter(Boolean) || [],
      variantOptions: Array.isArray(raw.variant_options)
        ? raw.variant_options.map((opt: any) => ({ name: String(opt.name), value: String(opt.value) }))
        : undefined,
      metadata: { lightspeedId: raw.id },
    });
  }

  /**
   * Transforms a WooCommerce product into a UniversalProduct.
   * WooCommerce format: { id, sku, name, price, stock_quantity, ... }
   */
  static fromWooCommerce(raw: Record<string, unknown>): UniversalProduct {
    const parsed = UniversalProductSchema.parse({
      sku: raw.sku || '',
      title: raw.name || '',
      description: (raw.short_description || '') as string,
      price: parseFloat(String(raw.price || 0)),
      quantity: parseInt(String(raw.stock_quantity || 0), 10),
      category: undefined,
      imageUrl: (raw.images as any)?.[0]?.src || undefined,
      thumbnailUrl: (raw.images as any)?.[0]?.src || undefined,
      metadata: { woocommerceId: raw.id },
    });
    return new UniversalProduct(parsed);
  }

  // ─── Egress: Universal → Platform ────────────

  /**
   * Transforms a Prisma Product record back into a UniversalProduct.
   */
  static fromDatabase(raw: any): UniversalProduct {
    const parsed = UniversalProductSchema.parse({
      sku: raw.sku,
      title: raw.title,
      description: raw.description || '',
      price: parseFloat(String(raw.price || 0)),
      quantity: parseInt(String(raw.quantity || 0), 10),
      category: raw.category || undefined,
      imageUrl: raw.imageUrl || undefined,
      thumbnailUrl: (raw.metadata as any)?.thumbnailUrl || undefined,
      galleryImages: (raw.metadata as any)?.galleryImages || undefined,
      metadata: raw.metadata || undefined,
    });
    return new UniversalProduct(parsed);
  }

  /**
   * Transforms to a Prisma-compatible object for Cloud SQL insertion.
   */
  toPostgres(): Record<string, unknown> {
    return {
      sku: this.data.sku,
      title: this.data.title,
      description: this.data.description || null,
      price: this.data.price,
      quantity: this.data.quantity,
      category: this.data.category || null,
      imageUrl: this.data.imageUrl || null,
      variantParentId: this.data.variantParentId || null,
      parentSku: this.data.handle || null,
      brand: this.data.brand || null,
      tags: this.data.tags || [],
      metadata: {
        ...this.data.metadata,
        thumbnailUrl: this.data.thumbnailUrl,
        galleryImages: this.data.galleryImages || [],
        variantOptions: this.data.variantOptions || []
      },
    };
  }

  /**
   * Transforms to WooCommerce REST API format.
   * @param wooCategoryId Optional category ID to associate
   * @param customMappings Optional generic field mappings (e.g. { tags: "category" })
   */
  toWoo(wooCategoryId?: number, customMappings?: Record<string, string>): Record<string, unknown> {
    const payload: Record<string, any> = {
      sku: this.data.sku,
      name: this.data.title,
      short_description: this.data.description || '',
      regular_price: String(this.data.price),
      stock_quantity: this.data.quantity,
      manage_stock: true,
      images: (() => {
        const mainImg = this.data.imageUrl || this.data.thumbnailUrl;
        const allImages: Array<{src: string}> = [];
        if (mainImg) allImages.push({ src: mainImg });
        
        if (this.data.galleryImages) {
          for (const url of this.data.galleryImages) {
            if (url !== mainImg) allImages.push({ src: url });
          }
        }
        return allImages;
      })(),
    };

    if (wooCategoryId) {
      payload.categories = [{ id: wooCategoryId }];
    }

    // Apply custom dynamic mappings if provided
    if (customMappings) {
      for (const [lsField, wooField] of Object.entries(customMappings)) {
        const val = (this.data as any)[lsField];
        if (val !== undefined) {
          payload[wooField] = val;
        }
      }
    }

    if (this.data.variantOptions && this.data.variantOptions.length > 0) {
      payload.attributes = this.data.variantOptions.map(opt => ({
        name: opt.name,
        option: opt.value
      }));
    }

    return payload;
  }

  /**
   * Transforms to Lightspeed X-Series API format.
   */
  toLightspeed(): Record<string, unknown> {
    return {
      sku: this.data.sku,
      name: this.data.title,
      description: this.data.description,
      retail_price: this.data.price,
      // Note: X-Series inventory is updated via different specialized endpoints
    };
  }
}
