import { Router } from 'express';
import axios from 'axios';
import { prisma } from '../lib/prisma.js';
import { config, secrets } from '../config/env.js';

export const authRouter = Router();

/**
 * GET /auth/lightspeed
 * Deprecated: Previously used for OAuth 2.0 flow. 
 * Now uses /auth/lightspeed/manual for Personal Tokens.
 */
authRouter.get('/lightspeed', (_req, res) => {
  res.status(410).json({ 
    error: 'OAuth Flow Deprecated', 
    message: 'Please use the Manual Token route (/auth/lightspeed/manual) with your Private Application token.' 
  });
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
