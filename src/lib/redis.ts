/**
 * Redis Loop-Prevention Helper
 *
 * Architecture §2D: "When a webhook arrives, we create a key in Redis:
 * sync:{sku}:{quantity} with a 60-second TTL."
 *
 * Prevents infinite ping-pong between Lightspeed and WooCommerce:
 * Woo updates LS → LS webhook fires → would update Woo again (loop!)
 */

import Redis from 'ioredis';
import { config } from '../config/env.js';

let redis: Redis | null = null;

/**
 * Get or create the Redis connection to Memorystore.
 */
export function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis({
      host: config.redisHost,
      port: config.redisPort,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
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
  const client = getRedisClient();
  const key = syncKey(sku, quantity);
  const exists = await client.exists(key);
  return exists === 1;
}

/**
 * Mark this sync event as "in progress" to prevent echo loops.
 * Sets a key with the configured TTL (default 60 seconds).
 */
export async function markSyncInProgress(
  sku: string,
  quantity: number
): Promise<void> {
  const client = getRedisClient();
  const key = syncKey(sku, quantity);
  await client.set(key, '1', 'EX', config.redisSyncTtl);
}

/**
 * Gracefully disconnect from Redis.
 */
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
