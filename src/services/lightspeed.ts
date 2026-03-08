/**
 * Lightspeed Retail API Client
 *
 * Handles OAuth 2.0 lifecycle with automatic token refresh.
 * Architecture §4: "Middleware detects 401 Unauthorized, triggers refresh flow
 * using refresh_token from Cloud SQL, retries original request."
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config/env.js';

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
    // TODO: Fetch current access_token from credentials table (Prisma)
    // const credential = await prisma.credential.findUnique({ where: { platform: 'lightspeed' } });
    // requestConfig.headers.Authorization = `Bearer ${credential.accessToken}`;
    return requestConfig;
  });

  // ─── Response Interceptor: Handle 401 + Refresh ───
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config;

      if (error.response?.status === 401 && originalRequest && !(originalRequest as any)._retry) {
        (originalRequest as any)._retry = true;

        // TODO: Call refreshLightspeedToken() to get new access_token
        // TODO: Update credentials table with new tokens
        // TODO: Update originalRequest.headers.Authorization
        // return client(originalRequest);
      }

      return Promise.reject(error);
    }
  );

  return client;
}

/**
 * Refreshes the Lightspeed OAuth access token using the stored refresh_token.
 * Architecture §4: Tokens stored in Cloud SQL credentials table.
 */
export async function refreshLightspeedToken(): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  // TODO: Fetch refresh_token from credentials table
  // TODO: POST to https://cloud.lightspeedapp.com/oauth/access_token.php
  // TODO: Update credentials table with new tokens

  throw new Error('refreshLightspeedToken not yet implemented');
}
