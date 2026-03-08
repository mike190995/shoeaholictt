import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Cloud SQL (PostgreSQL via Prisma)
  databaseUrl: process.env.DATABASE_URL || '',

  // Memorystore (Redis)
  redisHost: process.env.REDIS_HOST || '127.0.0.1',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),

  // GCP
  gcpProjectId: process.env.GCP_PROJECT_ID || 'senmizu',
  cloudTasksLocation: process.env.CLOUD_TASKS_LOCATION || 'us-central1',
  cloudTasksQueue: process.env.CLOUD_TASKS_QUEUE || 'inventory-sync-queue',
  workerServiceUrl: process.env.WORKER_SERVICE_URL || '',

  // Lightspeed Retail OAuth
  lightspeedClientId: process.env.LS_CLIENT_ID || '',
  lightspeedClientSecret: process.env.LS_CLIENT_SECRET || '',
  lightspeedRedirectUri: process.env.LS_REDIRECT_URI || '',
  lightspeedAccountId: process.env.LS_ACCOUNT_ID || '',

  // WooCommerce
  wooBaseUrl: process.env.WOO_BASE_URL || '',
  wooConsumerKey: process.env.WOO_CONSUMER_KEY || '',
  wooConsumerSecret: process.env.WOO_CONSUMER_SECRET || '',

  // Custom Frontend
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',

  // Redis loop-prevention TTL (seconds)
  redisSyncTtl: parseInt(process.env.REDIS_SYNC_TTL || '60', 10),
} as const;
