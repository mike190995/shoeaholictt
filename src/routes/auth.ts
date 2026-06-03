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
 * GET & POST /auth/lightspeed/manual
 * Manually sets a Personal Token in the database.
 * Supports direct query params (for quick links) or form submissions.
 */
authRouter.get('/lightspeed/manual', async (req, res, next) => {
  // 1. Session auth guard
  if (!req.session || !(req.session as any).authenticated) {
    return res.redirect('/login');
  }

  try {
    const { token, accountId, success } = req.query;

    // Load existing credentials to display in the form
    const credential = await prisma.credential.findUnique({ where: { platform: 'lightspeed' } });

    // If query params are provided, perform immediate update (e.g. from hardcoded dashboard link)
    if (token && typeof token === 'string' && accountId && typeof accountId === 'string') {
      const trimmedToken = token.trim();
      const trimmedAccountId = accountId.trim();

      if (!trimmedToken.startsWith('lsxs_pt_')) {
        return res.render('manual_auth', {
          title: 'Lightspeed Connection',
          activeTab: 'dashboard',
          success: false,
          error: 'Invalid token format. Must start with lsxs_pt_ for X-Series.',
          token: trimmedToken,
          accountId: trimmedAccountId
        });
      }

      await prisma.credential.upsert({
        where: { platform: 'lightspeed' },
        update: {
          accessToken: trimmedToken,
          refreshToken: null,
          expiresAt: null,
          accountId: trimmedAccountId,
        },
        create: {
          platform: 'lightspeed',
          accessToken: trimmedToken,
          refreshToken: null,
          expiresAt: null,
          accountId: trimmedAccountId,
        },
      });

      return res.render('manual_auth', {
        title: 'Lightspeed Connection',
        activeTab: 'dashboard',
        success: true,
        error: null,
        token: trimmedToken,
        accountId: trimmedAccountId
      });
    }

    // Default: render form with current database values
    res.render('manual_auth', {
      title: 'Lightspeed Connection',
      activeTab: 'dashboard',
      success: success === 'true',
      error: null,
      token: credential?.accessToken || '',
      accountId: credential?.accountId || '',
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/lightspeed/manual', async (req, res, next) => {
  // Session auth guard
  if (!req.session || !(req.session as any).authenticated) {
    return res.redirect('/login');
  }

  try {
    const { token, accountId } = req.body;

    if (!token || typeof token !== 'string' || !accountId || typeof accountId !== 'string') {
      return res.render('manual_auth', {
        title: 'Lightspeed Connection',
        activeTab: 'dashboard',
        success: false,
        error: 'Missing token or Store Domain / Account ID.',
        token: (token || '').trim(),
        accountId: (accountId || '').trim()
      });
    }

    const trimmedToken = token.trim();
    const trimmedAccountId = accountId.trim();

    if (!trimmedToken.startsWith('lsxs_pt_')) {
      return res.render('manual_auth', {
        title: 'Lightspeed Connection',
        activeTab: 'dashboard',
        success: false,
        error: 'Invalid token format. Must start with lsxs_pt_ for X-Series.',
        token: trimmedToken,
        accountId: trimmedAccountId
      });
    }

    await prisma.credential.upsert({
      where: { platform: 'lightspeed' },
      update: {
        accessToken: trimmedToken,
        refreshToken: null,
        expiresAt: null,
        accountId: trimmedAccountId,
      },
      create: {
        platform: 'lightspeed',
        accessToken: trimmedToken,
        refreshToken: null,
        expiresAt: null,
        accountId: trimmedAccountId,
      },
    });

    res.render('manual_auth', {
      title: 'Lightspeed Connection',
      activeTab: 'dashboard',
      success: true,
      error: null,
      token: trimmedToken,
      accountId: trimmedAccountId
    });
  } catch (err) {
    next(err);
  }
});

