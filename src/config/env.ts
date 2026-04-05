import dotenv from 'dotenv';
import { getSecretOrEnv } from '../lib/secrets.js';

dotenv.config();

const getEnv = (key: string, defaultValue = ''): string => {
  const value = process.env[key];
  return value ? value.trim() : defaultValue;
};

// ─── Static Config (Non-Sensitive) ──────────────────
// These values are safe to load synchronously from env vars.
export const config = {
  // Server
  port: parseInt(getEnv('PORT', '8080'), 10),
  nodeEnv: getEnv('NODE_ENV', 'development'),

  // GCP
  gcpProjectId: getEnv('GCP_PROJECT_ID', 'senmizu'),
  cloudTasksLocation: getEnv('CLOUD_TASKS_LOCATION', 'us-central1'),
  cloudTasksQueue: getEnv('CLOUD_TASKS_QUEUE', 'inventory-sync-queue'),
  gcsBucket: getEnv('GCS_BUCKET', 'lswoo-images'),

  // Memorystore (Redis)
  redisHost: getEnv('REDIS_HOST', '127.0.0.1'),
  redisPort: parseInt(getEnv('REDIS_PORT', '6379'), 10),

  // Custom Frontend
  frontendOrigin: getEnv('FRONTEND_ORIGIN', 'http://localhost:3000'),

  // Lightspeed (non-secret identifiers)
  lightspeedOutletId: getEnv('LS_OUTLET_ID'),

  // Redis loop-prevention TTL (seconds)
  redisSyncTtl: parseInt(getEnv('REDIS_SYNC_TTL', '60'), 10),
} as const;

// ─── Sensitive Secrets ──────────────────────────────
// These are loaded asynchronously from GCP Secret Manager in production,
// or from .env in development. Must call initSecrets() before use.
interface SecretsConfig {
  databaseUrl: string;
  lightspeedClientId: string;
  lightspeedClientSecret: string;
  lightspeedAccountId: string;
  lightspeedRedirectUri: string;
  wooBaseUrl: string;
  wooConsumerKey: string;
  wooConsumerSecret: string;
  workerServiceUrl: string;
  workerSecret: string;
}

export const secrets: SecretsConfig = {
  databaseUrl: '',
  lightspeedClientId: '',
  lightspeedClientSecret: '',
  lightspeedAccountId: '',
  lightspeedRedirectUri: '',
  wooBaseUrl: '',
  wooConsumerKey: '',
  wooConsumerSecret: '',
  workerServiceUrl: '',
  workerSecret: '',
};

/**
 * Initialize sensitive secrets. Must be called once at application startup
 * before the Express server begins accepting requests.
 *
 * - In production: pulls from GCP Secret Manager (matching screenshot names).
 * - In development: falls back to process.env / .env file.
 */
export async function initSecrets(): Promise<void> {
  const entries: Array<[keyof typeof secrets, string, string]> = [
    ['databaseUrl',            'DATABASE_URL',         'DATABASE_URL'],
    ['lightspeedClientId',     'LS_CLIENT_ID',         'LS_CLIENT_ID'],
    ['lightspeedClientSecret', 'LS_CLIENT_SECRET',     'LS_CLIENT_SECRET'],
    ['lightspeedAccountId',    'LS_ACCOUNT_ID',        'LS_ACCOUNT_ID'],
    ['lightspeedRedirectUri',  'LS_REDIRECT_URI',      'LS_REDIRECT_URI'],
    ['wooBaseUrl',             'WOO_BASE_URL',         'WOO_BASE_URL'],
    ['wooConsumerKey',         'WOO_CONSUMER_KEY',     'WOO_CONSUMER_KEY'],
    ['wooConsumerSecret',      'WOO_CONSUMER_SECRET',  'WOO_CONSUMER_SECRET'],
    ['workerServiceUrl',       'WORKER_SERVICE_URL',   'WORKER_SERVICE_URL'],
    ['workerSecret',           'WORKER_SECRET',        'WORKER_SECRET'],
  ];

  const results = await Promise.allSettled(
    entries.map(async ([key, secretName, envKey]) => {
      const value = await getSecretOrEnv(secretName, envKey);
      secrets[key] = value;
    })
  );

  // Log any failures but don't crash — some secrets may be optional in dev
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.warn(`[Secrets] Failed to load ${String(entries[i][0])}: ${result.reason}`);
    }
  });
}
