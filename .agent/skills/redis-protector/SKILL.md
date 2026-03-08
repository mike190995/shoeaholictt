---
name: redis-protector
description: Prevents infinite "ping-pong" sync loops between Lightspeed and WooCommerce using Redis key deduplication.
---

# Redis Infinite Loop Preventer

Prevent "Ping-Pong" updates between Lightspeed and WooCommerce.

## The Problem

1. WooCommerce stock changes → webhook fires → middleware updates Lightspeed.
2. Lightspeed stock changes → webhook fires → middleware updates WooCommerce.
3. This creates an infinite loop.

## The Solution

Before enqueuing any update:

1. **Generate a hash**: `sync:{SKU}:{Quantity}` (e.g., `sync:SHOE-001:42`).
2. **Check Redis (Memorystore)**: If the hash exists, this is an "echo" — **drop the request**.
3. **If new**: Set the hash in Redis with a **60-second TTL** (`EX 60`).
4. Proceed with enqueuing the Cloud Task.

## Implementation Details

```typescript
// Check before enqueuing
const isDuplicate = await isDuplicateSync(sku, quantity);
if (isDuplicate) {
  console.log(`[Redis] Dropping echo: ${sku}:${quantity}`);
  return; // Kill the task
}

// Mark as in-progress
await markSyncInProgress(sku, quantity);

// Now safe to enqueue
await enqueueTask(direction, payload);
```

## TTL

- Default: **60 seconds** (configurable via `REDIS_SYNC_TTL` env var).
- After 60 seconds, a legitimate update with the same SKU:Quantity pair will be processed normally.

## Files to Modify

- `src/lib/redis.ts` — Redis helper with deduplication logic
- `src/routes/webhooks.ts` — Apply check before enqueuing
