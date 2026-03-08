/**
 * Redis Loop-Prevention Helper
 *
 * Architecture §2D: "When a webhook arrives, we create a key in Redis:
 * sync:{sku}:{quantity} with a 60-second TTL."
 *
 * Prevents infinite ping-pong between Lightspeed and WooCommerce:
 * Woo updates LS → LS webhook fires → would update Woo again (loop!)
 *
 * Falls back to in-memory Map when Redis is unavailable (local development).
 */

import Redis from 'ioredis';
import { config } from '../config/env.js';

let redis: Redis | null = null;
let useMemoryFallback = false;
const memoryStore = new Map<string, NodeJS.Timeout>();

/**
 * Get or create the Redis connection to Memorystore.
 * If connection fails, switches to in-memory fallback.
 */
export async function getRedisClient(): Promise<Redis | null> {
  if (useMemoryFallback) return null;

  if (!redis) {
    redis = new Redis({
      host: config.redisHost,
      port: config.redisPort,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 3000,
    });

    try {
      await redis.connect();
      console.log('[Redis] Connected to', config.redisHost);
    } catch {
      console.warn('[Redis] Connection failed — using in-memory fallback');
      useMemoryFallback = true;
      redis = null;
      return null;
    }
  }
  return redis;
}

/**
 * Generate a deduplication hash key for a sync event.
 * Format: sync:{sku}:{quantity}
 */
function syncKey(sku: string, quantity: number): string {
  return `sync:${sku}:${quantity}`;
}

/**
 * Check if this sync event is a redundant "echo" (loop).
 * Returns true if the event should be DROPPED.
 */
export async function isDuplicateSync(
  sku: string,
  quantity: number
): Promise<boolean> {
  const key = syncKey(sku, quantity);
  const client = await getRedisClient();

  if (client) {
    const exists = await client.exists(key);
    return exists === 1;
  }

  // In-memory fallback
  return memoryStore.has(key);
}

/**
 * Mark this sync event as "in progress" to prevent echo loops.
 * Sets a key with the configured TTL (default 60 seconds).
 */
export async function markSyncInProgress(
  sku: string,
  quantity: number
): Promise<void> {
  const key = syncKey(sku, quantity);
  const client = await getRedisClient();

  if (client) {
    await client.set(key, '1', 'EX', config.redisSyncTtl);
    return;
  }

  // In-memory fallback with TTL
  if (memoryStore.has(key)) {
    clearTimeout(memoryStore.get(key)!);
  }
  const timeout = setTimeout(() => memoryStore.delete(key), config.redisSyncTtl * 1000);
  memoryStore.set(key, timeout);
}

/**
 * Gracefully disconnect from Redis.
 */
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
  // Clear memory fallback
  for (const timeout of memoryStore.values()) {
    clearTimeout(timeout);
  }
  memoryStore.clear();
}
