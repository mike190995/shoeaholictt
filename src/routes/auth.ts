import { Router } from 'express';

export const authRouter = Router();

/**
 * GET /auth/lightspeed
 * Initiates the Lightspeed OAuth 2.0 authorization flow.
 * Redirects the user to Lightspeed's consent screen.
 */
authRouter.get('/lightspeed', (_req, res) => {
  // TODO: Build Lightspeed OAuth authorization URL
  // const authUrl = `https://cloud.lightspeedapp.com/oauth/authorize?...`;
  // res.redirect(authUrl);

  res.status(501).json({ message: 'OAuth flow not yet implemented' });
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

    if (!code) {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    // TODO: Exchange code for tokens via Lightspeed token endpoint
    // TODO: Store tokens in credentials table (Prisma)
    // TODO: Redirect user to success page

    res.json({ message: 'OAuth callback received', code });
  } catch (err) {
    next(err);
  }
});
