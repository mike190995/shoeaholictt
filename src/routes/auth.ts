import { Router } from 'express';
import axios from 'axios';
import { prisma } from '../lib/prisma.js';
import { config, secrets } from '../config/env.js';

export const authRouter = Router();

/**
 * GET /auth/lightspeed
 * Initiates the Lightspeed X-Series (Vend) OAuth 2.0 authorization flow.
 */
authRouter.get('/lightspeed', (_req, res) => {
  // X-Series requires a state parameter of at least 8 characters
  const state = Math.random().toString(36).substring(2, 15);
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: secrets.lightspeedClientId,
    redirect_uri: config.lightspeedRedirectUri,
    state,
  });
  
  // X-Series (Vend) authorization URL
  const authUrl = `https://secure.vendhq.com/connect?${params.toString()}`;
  res.redirect(authUrl);
});

/**
 * GET /auth/lightspeed/callback
 * Handles the OAuth callback from Lightspeed X-Series.
 */
authRouter.get('/lightspeed/callback', async (req, res, next) => {
  try {
    const { code, domain_prefix, error, error_description } = req.query;

    if (error) {
      res.status(400).json({ 
        error: 'Lightspeed Auth Error', 
        details: error,
        description: error_description 
      });
      return;
    }

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    if (!domain_prefix || typeof domain_prefix !== 'string') {
      res.status(400).json({ error: 'Missing domain prefix from Lightspeed X-Series' });
      return;
    }

    // Exchange code for tokens using the store-specific token endpoint
    const tokenUrl = `https://${domain_prefix}.vendhq.com/api/1.0/token`;
    
    console.log(`[Lightspeed X-Series] Exchanging code for tokens at: ${tokenUrl}`);

    const tokenParams = new URLSearchParams();
    tokenParams.append('client_id', secrets.lightspeedClientId);
    tokenParams.append('client_secret', secrets.lightspeedClientSecret);
    tokenParams.append('code', code);
    tokenParams.append('grant_type', 'authorization_code');
    tokenParams.append('redirect_uri', config.lightspeedRedirectUri);

    const response = await axios.post(tokenUrl, tokenParams, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, refresh_token, expires_in } = response.data;
    
    // X-Series usually provides expires_in in seconds. Default to 1 hour if missing.
    const expiresInSeconds = typeof expires_in === 'number' ? expires_in : 3600;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    console.log(`[Lightspeed X-Series] Auth successful for domain: ${domain_prefix}. Expires at: ${expiresAt.toISOString()}`);

    // Upsert to Prisma credentials table
    await prisma.credential.upsert({
      where: { platform: 'lightspeed' },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        accountId: domain_prefix // Store the domain prefix as the account ID
      },
      create: {
        platform: 'lightspeed',
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        accountId: domain_prefix
      }
    });

    res.json({ 
      message: 'Lightspeed X-Series setup complete.',
      account: domain_prefix
    });
  } catch (err: any) {
    const errorData = err.response?.data;
    const errorMessage = err.message;
    
    console.error('Lightspeed X-Series Auth Error:', {
      message: errorMessage,
      data: errorData,
      status: err.response?.status,
      config: {
        url: err.config?.url,
        method: err.config?.method,
        headers: { ...err.config?.headers, Authorization: '[REDACTED]' }
      }
    });

    // Pass specialized error if we have it
    if (errorData?.error_description || errorData?.message) {
      const specializedError = new Error(errorData.error_description || errorData.message);
      (specializedError as any).statusCode = err.response?.status || 500;
      return next(specializedError);
    }
    
    next(err);
  }
});

/**
 * GET /auth/lightspeed/manual
 * TEMPORARY: Manually sets a Personal Token in the database.
 * Usage: /auth/lightspeed/manual?token=lsxs_pt_...&accountId=shoptt
 */
authRouter.get('/lightspeed/manual', async (req, res, next) => {
  console.log('[Auth Debug] /auth/lightspeed/manual query params:', req.query);
  try {
    const { token, accountId } = req.query;

    if (!token || typeof token !== 'string' || !accountId || typeof accountId !== 'string') {
      res.status(400).json({ error: 'Missing token or accountId query parameter.' });
      return;
    }

    if (!token.startsWith('lsxs_pt_')) {
      res.status(400).json({ error: 'Invalid token format. Must start with lsxs_pt_ for X-Series.' });
      return;
    }

    await prisma.credential.upsert({
      where: { platform: 'lightspeed' },
      update: {
        accessToken: token,
        refreshToken: null,
        expiresAt: null,
        accountId,
      },
      create: {
        platform: 'lightspeed',
        accessToken: token,
        refreshToken: null,
        expiresAt: null,
        accountId,
      },
    });

    res.json({ 
      message: 'Lightspeed X-Series Personal Token set successfully.',
      accountId,
      status: 'authenticated'
    });
  } catch (err) {
    next(err);
  }
});
