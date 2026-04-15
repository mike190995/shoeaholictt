/**
 * Prisma Client Singleton
 *
 * Shared instance used across all routes and services.
 * Prevents multiple connections during hot-reload in development.
 * 
 * Uses @prisma/adapter-pg for Prisma 7 compatibility.
 * The connection is lazy — pg.Pool only connects on first query,
 * giving the Cloud SQL proxy sidecar time to initialize.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { secrets } from '../config/env.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let _prisma: PrismaClient | undefined;

function getPrisma(): PrismaClient {
  if (_prisma) return _prisma;
  if (globalForPrisma.prisma) {
    _prisma = globalForPrisma.prisma;
    return _prisma;
  }

  const databaseUrl = secrets.databaseUrl || process.env.DATABASE_URL!;
  console.log(`[Prisma] Creating lazy PrismaClient with pg adapter...`);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  
  // Test connection immediately to identify Cloud SQL proxy issues
  pool.connect()
    .then(client => {
      console.log(`[Database] Successfully connected to PostgreSQL via ${databaseUrl.includes('cloudsql') ? 'Unix Socket' : 'TCP'}`);
      client.release();
    })
    .catch(err => {
      console.error(`[Critical] Database connection failed: ${err.message}`);
    });

  const adapter = new PrismaPg(pool as any);

  _prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = _prisma;
  }

  return _prisma;
}

// Export a proxy that lazily initializes Prisma on first access
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as any)[prop];
  },
});
