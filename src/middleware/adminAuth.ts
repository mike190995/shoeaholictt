import { Request, Response, NextFunction } from 'express';
import { secrets } from '../config/env.js';

/**
 * Basic Auth middleware to secure the admin dashboard.
 * Uses the WORKER_SECRET as the password.
 */
export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  // For diagnostic requests or if WORKER_SECRET is not set (legacy/dev), we might want to bypass
  // But for production, this IS the security.
  const password = process.env.WORKER_SECRET || secrets.workerSecret;

  if (!password) {
    console.warn('[Security] WORKER_SECRET not set. Admin panel is VULNERABLE.');
    return next();
  }

  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="LSWOO Admin"');
    return res.status(401).send('Authentication required.');
  }

  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];

  // We allow either the username or password to be the secret for convenience
  if (user === password || pass === password || (user === 'admin' && pass === password)) {
    return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="LSWOO Admin"');
  return res.status(401).send('Invalid credentials.');
};
