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
      price: parseFloat(String(raw.price || raw.retail_price || 0)),
      quantity: parseInt(String((raw.inventory as any)?.[0]?.count || 0), 10),
      category: typeof raw.type === 'object' && raw.type !== null 
        ? (raw.type as any).name 
        : (raw.type as string) || undefined,
      imageUrl: (raw.image_url as string) || undefined,
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
        variantOptions: this.data.variantOptions || []
      },
    };
  }

  /**
   * Transforms to WooCommerce REST API format.
   */
  toWoo(): Record<string, unknown> {
    const payload: Record<string, any> = {
      sku: this.data.sku,
      name: this.data.title,
      short_description: this.data.description || '',
      regular_price: String(this.data.price),
      stock_quantity: this.data.quantity,
      manage_stock: true,
    };

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
