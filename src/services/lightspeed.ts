/**
 * Lightspeed Retail API Client
 *
 * Handles OAuth 2.0 lifecycle with automatic token refresh.
 * Architecture §4: "Middleware detects 401 Unauthorized, triggers refresh flow
 * using refresh_token from Cloud SQL, retries original request."
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

const LS_API_BASE = 'https://api.lightspeedapp.com/API/V3';

/**
 * Creates an Axios instance with an interceptor that automatically
 * handles 401 responses by refreshing the OAuth token and retrying.
 */
export function createLightspeedClient(): AxiosInstance {
  const client = axios.create({
    baseURL: `${LS_API_BASE}/Account/${config.lightspeedAccountId}`,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // ─── Request Interceptor: Attach Access Token ───
  client.interceptors.request.use(async (requestConfig) => {
    const credential = await prisma.credential.findUnique({ where: { platform: 'lightspeed' } });
    if (credential?.accessToken) {
      requestConfig.headers.Authorization = `OAuth ${credential.accessToken}`; // LS uses OAuth keyword
    }
    return requestConfig;
  });

  // ─── Response Interceptor: Handle 401 + Refresh ───
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config;

      if (error.response?.status === 401 && originalRequest && !(originalRequest as any)._retry) {
        (originalRequest as any)._retry = true;

        const tokens = await refreshLightspeedToken();
        if (tokens) {
          originalRequest.headers.Authorization = `OAuth ${tokens.accessToken}`;
          return client(originalRequest);
        }
      }

      return Promise.reject(error);
    }
  );

  return client;
}

/**
 * Refreshes the Lightspeed OAuth access token using the stored refresh_token.
 */
export async function refreshLightspeedToken(): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  const credential = await prisma.credential.findUnique({ where: { platform: 'lightspeed' } });
  if (!credential?.refreshToken) return null;

  try {
    const response = await axios.post('https://cloud.lightspeedapp.com/oauth/access_token.php', {
      client_id: config.lightspeedClientId,
      client_secret: config.lightspeedClientSecret,
      refresh_token: credential.refreshToken,
      grant_type: 'refresh_token'
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    const { access_token, refresh_token, expires_in } = response.data;
    
    await prisma.credential.update({
      where: { platform: 'lightspeed' },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000)
      }
    });

    return { accessToken: access_token, refreshToken: refresh_token };
  } catch (err: any) {
    console.error('[Lightspeed] Failed to refresh token:', err.response?.data || err.message);
    return null;
  }
}
