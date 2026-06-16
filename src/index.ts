import { resolve } from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, initSecrets, secrets } from './config/env.js';
import { APP_VERSION } from './version.js';
import { apiRouter } from './routes/api.js';
import { webhookRouter } from './routes/webhooks.js';
import { authRouter } from './routes/auth.js';
import { workerRouter } from './routes/worker.js';
import { adminRouter } from './routes/admin.js';
import { syncRouter } from './routes/sync.js';
import { adminAuth } from './middleware/adminAuth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { log } from './lib/logger.js';
import session from 'express-session';

const app = express();

// Cloud Run uses a proxy, so we must trust it for rate limiting to work correctly
app.set('trust proxy', 1);

// ─── Security & Parsing ────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com"],
      "style-src": ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      "font-src": ["'self'", "fonts.gstatic.com"],
      "img-src": ["'self'", "data:", "*"],
    },
  },
}));
app.use(cors({ origin: config.frontendOrigin }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({
  verify: (req: any, _res, buf) => {
    // Save raw body for Lightspeed HMAC verification
    req.rawBody = buf;
  }
}));

// ─── Session Setup ─────────────────────────────
app.use(session({
  secret: secrets.sessionSecret || secrets.workerSecret || 'lswoo-fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: config.nodeEnv === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.set('views', resolve(process.cwd(), 'src/views'));
app.set('view engine', 'ejs');

// ─── Initial Redirects ──────────────────────────
app.get('/', (req, res) => res.redirect('/admin'));
app.get('/dashboard', (req, res) => res.redirect('/admin'));
app.get('/importer', (req, res) => res.redirect('/admin/import'));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', version: APP_VERSION, timestamp: new Date().toISOString() });
});

// Global Rate Limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 1000, 
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, 
  legacyHeaders: false, 
});
app.use(globalLimiter);

// ─── Global Auth Guard ─────────────────────────
// Only enforce session on browser-facing admin routes.
app.use((req, res, next) => {
  const publicPaths = ['/login', '/logout', '/health', '/debug'];
  const publicPrefixes = [
    '/api',        // Root API endpoints
    '/auth',       // Lightspeed OAuth / token routes
    '/worker',     // Cloud Tasks worker callbacks
    '/webhooks',   // Lightspeed & WooCommerce incoming webhooks
    '/admin/api'   // Dashboard AJAX calls (protected by adminAuth later)
  ];
  
  const isPublic = publicPaths.includes(req.path) || 
                   publicPrefixes.some(prefix => req.path.startsWith(prefix));

  if (isPublic) return next();

  // Special check for authenticated sessions
  if (req.session && (req.session as any).authenticated) {
    return next();
  }

  // If it's an API request expecting JSON, return 401 instead of 302 redirect
  if (req.path.includes('/api/') || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired. Please log in.' });
  }

  // Otherwise (browser navigation), force redirect to /login
  res.redirect('/login');
});

// ─── Frontend Static Serving ────────────────────
const frontendDist = resolve(process.cwd(), 'frontend/dist');
app.use(express.static(frontendDist));

// ─── Routes ────────────────────────────────────
app.use('/api', apiRouter);          
app.use('/webhooks', webhookRouter); 
app.use('/auth', authRouter);        
app.use('/worker', workerRouter);    

// Login Routes
app.get('/login', (req, res) => {
  if (req.session && (req.session as any).authenticated) {
    return res.redirect('/admin');
  }
  res.render('login', { title: 'Security Gate', error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const adminSecret = secrets.workerSecret;

  // Allow WORKER_SECRET to act as either username or password as requested
  if (password === adminSecret || username === adminSecret) {
    (req.session as any).authenticated = true;
    return res.redirect('/admin');
  }

  res.render('login', { title: 'Security Gate', error: 'Invalid access key' });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.use('/admin', adminAuth, adminRouter);      // Admin GUI (Fixed for Express 5)
app.use('/sync', adminAuth, syncRouter);        

app.get('/debug', (req, res) => {
  const routes: string[] = [];
  try {
    const stack = (app as any)._router?.stack || (app as any).router?.stack || [];
    stack.forEach((r: any) => {
      if (r.route && r.route.path) {
        routes.push(r.route.path);
      }
    });
  } catch (e) {
    console.warn('Could not list routes in /debug');
  }

  res.json({
    message: 'Debug Info',
    routes,
    config: {
      port: config.port,
      nodeEnv: config.nodeEnv,
    }
  });
});

// ─── Global Catch-All for React SPA ────────────
app.get('/*path', (req, res, next) => {
  // If the request is for an API route or webhook that wasn't matched, skip to error handler (404 API)
  if (req.path.startsWith('/api') || req.path.startsWith('/webhooks') || req.path.startsWith('/admin/api')) {
    return next();
  }
  // Admin EJS pages are handled by adminRouter, not the SPA — let them 404 naturally if not matched
  if (req.path.startsWith('/admin')) {
    return next();
  }
  // Otherwise, serve index.html for client-side routing (React SPA)
  res.sendFile(resolve(frontendDist, 'index.html'));
});

// ─── Global Error Handler ──────────────────────
app.use(errorHandler);

// ─── Start Server ──────────────────────────────
async function main() {
  // Load secrets from GCP Secret Manager (production) or .env (development)
  await initSecrets();

  app.listen(config.port, () => {
    console.log(`🚀 LSWOO Middleware running on port ${config.port}`);
    console.log(`   Environment: ${config.nodeEnv}`);
  });
}

main().catch((err) => {
  console.error('💀 Fatal startup error:', err);
  process.exit(1);
});

export default app;

