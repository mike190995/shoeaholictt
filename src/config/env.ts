import dotenv from 'dotenv';

dotenv.config();

const getEnv = (key: string, defaultValue = ''): string => {
  const value = process.env[key];
  return value ? value.trim() : defaultValue;
};

export const config = {
  // Server
  port: parseInt(getEnv('PORT', '8080'), 10),
  nodeEnv: getEnv('NODE_ENV', 'development'),

  // Cloud SQL (PostgreSQL via Prisma)
  databaseUrl: getEnv('DATABASE_URL'),

  // Memorystore (Redis)
  redisHost: getEnv('REDIS_HOST', '127.0.0.1'),
  redisPort: parseInt(getEnv('REDIS_PORT', '6379'), 10),

  // GCP
  gcpProjectId: getEnv('GCP_PROJECT_ID', 'senmizu'),
  cloudTasksLocation: getEnv('CLOUD_TASKS_LOCATION', 'us-central1'),
  cloudTasksQueue: getEnv('CLOUD_TASKS_QUEUE', 'inventory-sync-queue'),
  workerServiceUrl: getEnv('WORKER_SERVICE_URL'),
  workerSecret: getEnv('WORKER_SECRET'),

  // Lightspeed X-Series (Vend) OAuth
  lightspeedClientId: getEnv('LS_CLIENT_ID'),
  lightspeedClientSecret: getEnv('LS_CLIENT_SECRET'),
  lightspeedRedirectUri: getEnv('LS_REDIRECT_URI'),
  lightspeedAccountId: getEnv('LS_ACCOUNT_ID'),
  lightspeedOutletId: getEnv('LS_OUTLET_ID'), // Target Outlet for web orders

  // WooCommerce
  wooBaseUrl: getEnv('WOO_BASE_URL'),
  wooConsumerKey: getEnv('WOO_CONSUMER_KEY'),
  wooConsumerSecret: getEnv('WOO_CONSUMER_SECRET'),

  // Custom Frontend
  frontendOrigin: getEnv('FRONTEND_ORIGIN', 'http://localhost:3000'),

  // Redis loop-prevention TTL (seconds)
  redisSyncTtl: parseInt(getEnv('REDIS_SYNC_TTL', '60'), 10),
} as const;
