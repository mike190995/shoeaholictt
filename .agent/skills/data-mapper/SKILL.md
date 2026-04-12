---
name: data-mapper
description: Implements the Universal Canonical Data Model to prevent vendor lock-in between Lightspeed, WooCommerce, and PostgreSQL.
---

# Universal Data Mapper

Implement a strict "Internal Canonical Model" to prevent vendor lock-in and avoid spaghetti code.

## Core Logic

### UniversalProduct Class

Create a `UniversalProduct` class that serves as the canonical intermediary between all platform-specific data formats.

### Ingress (Platform → Universal)

- `static fromLightspeed(data)` — Maps Lightspeed Retail JSON to UniversalProduct.
  - Lightspeed fields: `id`, `sku`, `handle`, `description`, `price_excluding_tax`, `categories.name`
  - *Note on Normalization:* Lightspeed APIs sometimes return a single JSON object instead of a collection array when an exact SKU/ID match is found. Always normalize ingress data with `Array.isArray(data) ? data : [data]` before mapping.
  - *Note on Images:* Prioritize the explicit `image_url` property for main variant-specific images. The `images` array generally contains the generic product gallery; map these valid URLs to a `galleryImages` property, avoiding duplicates.
  - *Note on Inventory:* **CRITICAL:** Lightspeed's base `/products?embed=inventory` and `/inventory?product_id=...` endpoints are often unreliable and can return incorrect zero-stock results. 
    - **For single products:** Use the dedicated endpoint `GET /api/2.0/products/{product_id}/inventory`. This is the only reliable way to get immediate stock levels for a specific variant.
    - **For bulk operations:** Do NOT rely on individual query parameters. Instead, paginate through the entire `/inventory` table (all pages) to build a complete memory-map of `product_id` to its stock levels across all outlets.
    - **Transformation:** Map the result (array of location records) to a single `quantity` by summing `inventory_level` (available stock) across all relevant retail outlets.
  - *Note on Variants:* Extract `variant_parent_id` and `variant_options` arrays to map parent-child relationships.
- `static fromWooCommerce(data)` — Maps WooCommerce JSON to UniversalProduct.
  - WooCommerce fields: `id`, `sku`, `name`, `price`, `stock_quantity`, `short_description`, `images[0].src`

### Egress (Universal → Platform)

- `toPostgres()` — Returns an object compatible with Prisma's `products` table schema.
- `toWoo()` — Returns WooCommerce REST API v3 product format.
- `toLightspeed()` — Returns Lightspeed Retail API item format.

## Validation

- Use **Zod** to validate the UniversalProduct object before any transformation occurs.
- Schema must enforce: `sku` (required string), `title` (required string), `price` (non-negative number), `quantity` (non-negative integer).

## Files to Modify

- `src/mappers/universal.ts` — The canonical data model
