/**
 * GCP Secret Manager Helper
 *
 * Architecture §4: "API Keys and OAuth Secrets are never in the code.
 * They are injected as Environment Variables via GCP Secret Manager."
 *
 * This module provides a convenience wrapper for accessing secrets
 * programmatically (e.g., during OAuth token refresh).
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { config } from '../config/env.js';

const secretsClient = new SecretManagerServiceClient();

/**
 * Access the latest version of a secret from GCP Secret Manager.
 */
export async function getSecret(secretName: string): Promise<string> {
  const name = `projects/${config.gcpProjectId}/secrets/${secretName}/versions/latest`;

  const [version] = await secretsClient.accessSecretVersion({ name });
  const payload = version.payload?.data;

  if (!payload) {
    throw new Error(`Secret "${secretName}" has no payload`);
  }

  return typeof payload === 'string'
    ? payload
    : Buffer.from(payload).toString('utf-8');
}
