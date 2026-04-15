import { Request, Response, NextFunction } from 'express';
import { secrets } from '../config/env.js';

/**
 * Basic Auth middleware to secure the admin dashboard.
 * Uses the WORKER_SECRET as the password.
 */
export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  // Check if session exists and is authenticated
  if (req.session && (req.session as any).authenticated) {
    return next();
  }

  // Check for Basic Auth as a fallback (for specialized diagnostic calls)
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const password = process.env.WORKER_SECRET || secrets.workerSecret;
    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const pass = auth[1];

    if (pass === password) {
       (req.session as any).authenticated = true;
       return next();
    }
  }

  // If it's an API request, return 401 instead of a redirect
  if (req.path.includes('/api/') || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Admin session required.' });
  }

  // Otherwise (browser navigation), redirect to the premium login portal
  res.redirect('/login');
};
