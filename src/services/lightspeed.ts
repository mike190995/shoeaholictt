/**
 * Lightspeed Retail API Client
 *
 * Handles OAuth 2.0 lifecycle with automatic token refresh.
 * Architecture §4: "Middleware detects 401 Unauthorized, triggers refresh flow
 * using refresh_token from Cloud SQL, retries original request."
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { config, secrets } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { log } from '../lib/logger.js';

// Helper to pause execution
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Creates an Axios instance for Lightspeed X-Series (Vend).
 */
export async function createLightspeedClient(): Promise<AxiosInstance> {
  const credential = await prisma.credential.findUnique({ where: { platform: 'lightspeed' } });
  
  if (!credential || !credential.accountId) {
    throw new Error('Lightspeed X-Series not authenticated. Please run /auth/lightspeed first.');
  }

  const client = axios.create({
    baseURL: `https://${credential.accountId}.vendhq.com/api/2.0`,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // ─── Request Interceptor: Attach Bearer Token ───
  client.interceptors.request.use(async (requestConfig) => {
    const cred = await prisma.credential.findUnique({ where: { platform: 'lightspeed' } });
    if (cred?.accessToken) {
      requestConfig.headers.Authorization = `Bearer ${cred.accessToken}`;
    }
    return requestConfig;
  });

  // ─── Response Interceptor: Handle 401 + Refresh ───
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config;

      // Handle 401 Unauthorized (Token Refresh)
      if (error.response?.status === 401 && originalRequest && !(originalRequest as any)._retry) {
        (originalRequest as any)._retry = true;

        const tokens = await refreshLightspeedToken();
        if (tokens) {
          originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
          return client(originalRequest);
        }
      }

      // Handle 429 Too Many Requests (Rate Limiting)
      if (error.response?.status === 429 && originalRequest) {
        const resetHeader = error.response.headers['x-ratelimit-reset'];
        
        if (resetHeader) {
          const resetTimeMs = parseInt(resetHeader as string, 10) * 1000;
          const nowMs = Date.now();
          const delayMs = Math.max(0, resetTimeMs - nowMs) + 1000;

          log.warn({ delayMs }, '[Lightspeed API] Rate limit reached — sleeping before retry');
          await sleep(delayMs);
          return client(originalRequest);
        } else {
          const retryCount = (originalRequest as any)._retryCount || 0;
          if (retryCount < 3) {
            (originalRequest as any)._retryCount = retryCount + 1;
            const fallbackDelay = Math.pow(2, retryCount) * 1000;
            log.warn({ retryCount, fallbackDelay }, '[Lightspeed API] 429 without reset header — fallback backoff');
            await sleep(fallbackDelay);
            return client(originalRequest);
          }
        }
      }

      return Promise.reject(error);
    }
  );

  return client;
}

/**
 * Refreshes the Lightspeed X-Series OAuth access token.
 */
export async function refreshLightspeedToken(): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  const credential = await prisma.credential.findUnique({ where: { platform: 'lightspeed' } });
  
  if (!credential || credential.accessToken.startsWith('lsxs_pt_') || !credential.refreshToken || !credential.accountId) {
    if (credential?.accessToken.startsWith('lsxs_pt_')) {
      log.debug('[Lightspeed] Personal Token detected — skipping refresh logic');
    }
    return null;
  }

  try {
    const tokenParams = new URLSearchParams();
    tokenParams.append('client_id', secrets.lightspeedClientId);
    tokenParams.append('client_secret', secrets.lightspeedClientSecret);
    tokenParams.append('refresh_token', credential.refreshToken);
    tokenParams.append('grant_type', 'refresh_token');

    const response = await axios.post(`https://${credential.accountId}.vendhq.com/api/1.0/token`, tokenParams, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, refresh_token, expires_in } = response.data;
    
    await prisma.credential.update({
      where: { platform: 'lightspeed' },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token || credential.refreshToken,
        expiresAt: new Date(Date.now() + expires_in * 1000)
      }
    });

    log.info('[Lightspeed] Token refreshed successfully');
    return { accessToken: access_token, refreshToken: refresh_token || credential.refreshToken };
  } catch (err: any) {
    log.error({ err: err.response?.data || err.message }, '[Lightspeed] Failed to refresh token');
    return null;
  }
}
