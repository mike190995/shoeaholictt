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
  - Lightspeed fields: `itemID`, `customSku`, `systemSku`, `description`, `amount`, `qoh`, `Category.name`
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
