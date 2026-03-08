---
name: checkout-handler
description: Manages the transition from Custom Site cart to Lightspeed Sale, with inventory verification and atomic updates.
---

# Custom Site Checkout Handler

Transition from "Cart" to "Lightspeed Sale."

## Flow

1. **Inventory Check**: Query Cloud SQL (Prisma) to verify stock availability for each item in the cart.
   - If any item is out of stock, return a `409 Conflict` with details.

2. **Atomicity**: Use a Prisma transaction to:
   - Decrement product quantities in the local database (the "Performance Mirror").
   - Create a sync log entry marking the sale as "pending."

3. **Lightspeed Sale**: After the local DB is updated, enqueue a Cloud Task to create the Sale in Lightspeed.
   - This ensures the custom site reflects the sale immediately, even if the Lightspeed API is slow.

## Endpoint

```
POST /api/checkout
Body: {
  "items": [
    { "sku": "SHOE-001", "quantity": 2 },
    { "sku": "SHOE-002", "quantity": 1 }
  ],
  "customer": { ... }
}
```

## Important

- The local DB update MUST succeed before the Cloud Task is enqueued.
- If the Lightspeed API call fails later, it will be retried via Cloud Tasks exponential backoff.
- The sync_logs table tracks the status of each sale sync.

## Files to Modify

- `src/routes/api.ts` — Add `POST /api/checkout` endpoint
- `src/services/sync.ts` — Handle `site_to_ls` direction
