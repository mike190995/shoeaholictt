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
   * Transforms a Lightspeed Retail item into a UniversalProduct.
   * Lightspeed format: { itemID, description, Prices.ItemPrice[0].amount, ... }
   */
  static fromLightspeed(raw: Record<string, unknown>): UniversalProduct {
    const parsed = UniversalProductSchema.parse({
      sku: raw.customSku || raw.systemSku || String(raw.itemID),
      title: raw.description || '',
      description: (raw.Note || '') as string,
      price: parseFloat(String(raw.amount || 0)),
      quantity: parseInt(String(raw.qoh || 0), 10),
      category: ((raw.Category as any)?.name || '') as string,
      imageUrl: undefined,
      metadata: { lightspeedId: raw.itemID },
    });
    return new UniversalProduct(parsed);
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
      metadata: this.data.metadata || null,
    };
  }

  /**
   * Transforms to WooCommerce REST API format.
   */
  toWoo(): Record<string, unknown> {
    return {
      sku: this.data.sku,
      name: this.data.title,
      short_description: this.data.description || '',
      regular_price: String(this.data.price),
      stock_quantity: this.data.quantity,
      manage_stock: true,
    };
  }

  /**
   * Transforms to Lightspeed Retail API format.
   */
  toLightspeed(): Record<string, unknown> {
    return {
      description: this.data.title,
      customSku: this.data.sku,
      Prices: {
        ItemPrice: [{ amount: String(this.data.price), useType: 'Default' }],
      },
      // Note: Lightspeed inventory is updated via ItemShop endpoint, not Item
    };
  }
}
