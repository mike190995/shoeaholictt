# Codebase Audit: 2-Areas for Improvement

This document outlines actionable architectural and functional improvements to bridge the current gap between data fetching and a fully automated, bi-directional synchronization system.

## 1. The Missing "Push to WooCommerce" Pipeline

The current system can pull from Lightspeed into a staging database, but the bridge to WooCommerce is incomplete.

- **[NEW] `createWooProduct()`**: Currently, [updateWooCommerceStock](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/src/services/woocommerce.ts#L88) throws an error if a product is not found in Woo by SKU.
- **Improved Workflow**:
  1. **Search & Stage**: User searches Lightspeed and imports to the local SQL mirror.
  2. **Review & Edit**: User edits staged data in "Spreadsheet View."
  3. **Select & Push**: A new UI action in the [ProductMatrix](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/frontend/src/components/ProductMatrix.tsx) or [SpreadsheetView](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/frontend/src/components/SpreadsheetView.tsx) to selectively push to WooCommerce.
  4. **Creation Logic**: If `woocommerceId` is missing in the local DB, the middleware should call `POST /products` on WooCommerce and store the returned ID.

## 2. Manual Unlink & Removal (Override Logic)

As per your project intent, users need manual overrides for redundancy.

- **Delinking**: Add a `POST /admin/api/products/:sku/unlink` endpoint that clears the `woocommerceId` in the local DB but keeps the product in Lightspeed. This prevents active syncs for that specific product.
- **Selective Deletion**: Add a "Remove from WooCommerce" button that deletes the remote product via API but preserves the item in the middleware and Lightspeed for future re-linking.

## 3. Reliable Bi-Directional Synchronization

The current sync is largely payload-driven (whipping full objects back and forth). This is prone to "Last Write Wins" race conditions.

- **Collision Resolution**: Implement a `lastUpdatedAt` comparison in the [Sync Service](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/src/services/sync.ts). If a webhook arrives for an object that was just edited manually in the middleware, the middleware should have the priority.
- **Idempotency**: All sync tasks should be idempotent. If a task fails midway and retries, it should not double-decrement stock or create duplicate products.

## 4. Frontend Architecture Modernization

To support a seamless CRM-like experience, the React frontend needs structural stabilization.

- **Unified Routing**: Implement `react-router-dom` to allow direct linking to specific logs or product SKUs (e.g., `/products/SHOE-001`).
- **Global Context**: Create a `SystemContext` to track:
  - **Auth Status**: Is Lightspeed authenticated? (Currently requires checking [admin/api/dashboard](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/src/routes/admin.ts#L58) manually).
  - **Connection Health**: Real-time health status shared across all views.
- **Shared API Client**: Use a central `api.ts` with interceptors for error handling and base URL configuration.

## 5. Webhook Lifecycle Management

Registering webhooks is currently a manual process.

- **Auto-Registration**: Add an "Initialize Webhooks" button on the dashboard that programmatically registers the middleware's `/webhooks/woo` and `/webhooks/lightspeed` URLs with the remote platforms.
- **Webhook Health**: Periodically check if webhooks are still active using a background cron job (Cloud Scheduler).

## 6. Advanced Inventory Intelligence

To go beyond simple 1:1 stock mirroring:
- **Location Buffers**: Implement a setting to deduct a margin of safety from Lightspeed stock levels (e.g., if LS has 2 units, report 0 to Woo) to prevent overselling on the last unit.
- **Outlet Mapping UI**: Currently, the `lightspeedOutletId` is hardcoded in the [config](file:///c:/Users/mike1/Documents/Antigravity/LSWOO/src/config/env.ts#L34). A UI tool to select the active fulfillment outlet is needed.
