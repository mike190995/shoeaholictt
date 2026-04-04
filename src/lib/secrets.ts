/**
 * GCP Secret Manager Helper
 *
 * Architecture §4: "API Keys and OAuth Secrets are never in the code.
 * They are injected as Environment Variables via GCP Secret Manager."
 *
 * Provides two modes:
 * - Production: Fetches secrets from GCP Secret Manager.
 * - Development: Falls back to process.env for local `.env` usage.
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { config } from '../config/env.js';
import { log } from './logger.js';

let secretsClient: SecretManagerServiceClient | null = null;

function getClient(): SecretManagerServiceClient {
  if (!secretsClient) {
    secretsClient = new SecretManagerServiceClient();
  }
  return secretsClient;
}

/**
 * Access the latest version of a secret from GCP Secret Manager.
 */
export async function getSecret(secretName: string): Promise<string> {
  const name = `projects/${config.gcpProjectId}/secrets/${secretName}/versions/latest`;

  const [version] = await getClient().accessSecretVersion({ name });
  const payload = version.payload?.data;

  if (!payload) {
    throw new Error(`Secret "${secretName}" has no payload`);
  }

  return typeof payload === 'string'
    ? payload
    : Buffer.from(payload).toString('utf-8');
}

/**
 * Try GCP Secret Manager first (production), fall back to an env var (development).
 *
 * @param secretName - The name of the secret in GCP Secret Manager (e.g. "LSWOO_DATABASE_URL")
 * @param envKey     - The corresponding env var name to fall back to (e.g. "DATABASE_URL")
 */
export async function getSecretOrEnv(secretName: string, envKey: string): Promise<string> {
  if (config.nodeEnv === 'production') {
    try {
      const value = await getSecret(secretName);
      log.debug({ secretName }, '[Secrets] Loaded from Secret Manager');
      return value.trim();
    } catch (err: any) {
      log.error({ secretName, err: err.message }, '[Secrets] Failed to load from Secret Manager — falling back to env');
    }
  }

  // Development fallback: read from process.env
  const envValue = process.env[envKey];
  if (!envValue) {
    log.warn({ envKey }, '[Secrets] Environment variable not set');
    return '';
  }
  return envValue.trim();
}
