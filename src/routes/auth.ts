import { Router } from 'express';
import axios from 'axios';
import { prisma } from '../lib/prisma.js';
import { config } from '../config/env.js';

export const authRouter = Router();

/**
 * GET /auth/lightspeed
 * Initiates the Lightspeed OAuth 2.0 authorization flow.
 * Redirects the user to Lightspeed's consent screen.
 */
authRouter.get('/lightspeed', (_req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.lightspeedClientId,
    scope: 'employee:all',
  });
  
  const authUrl = `https://cloud.lightspeedapp.com/oauth/authorize.php?${params.toString()}`;
  res.redirect(authUrl);
});

/**
 * GET /auth/lightspeed/callback
 * Handles the OAuth callback from Lightspeed.
 * Exchanges the authorization code for access + refresh tokens,
 * then stores them in the credentials table (Cloud SQL).
 */
authRouter.get('/lightspeed/callback', async (req, res, next) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    // Exchange code for tokens
    const response = await axios.post('https://cloud.lightspeedapp.com/oauth/access_token.php', {
      client_id: config.lightspeedClientId,
      client_secret: config.lightspeedClientSecret,
      code,
      grant_type: 'authorization_code'
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Upsert to Prisma credentials table
    await prisma.credential.upsert({
      where: { platform: 'lightspeed' },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        accountId: config.lightspeedAccountId
      },
      create: {
        platform: 'lightspeed',
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        accountId: config.lightspeedAccountId
      }
    });

    res.json({ message: 'OAuth setup complete. Tokens stored safely in DB.' });
  } catch (err: any) {
    console.error('Lightspeed Auth Error:', err.response?.data || err.message);
    next(err);
  }
});
