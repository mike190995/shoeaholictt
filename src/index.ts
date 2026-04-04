import { resolve } from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, initSecrets } from './config/env.js';
import { APP_VERSION } from './version.js';
import { apiRouter } from './routes/api.js';
import { webhookRouter } from './routes/webhooks.js';
import { authRouter } from './routes/auth.js';
import { workerRouter } from './routes/worker.js';
import { adminRouter } from './routes/admin.js';
import { syncRouter } from './routes/sync.js';
import { errorHandler } from './middleware/errorHandler.js';
import { log } from './lib/logger.js';

const app = express();

// Cloud Run uses a proxy, so we must trust it for rate limiting to work correctly
app.set('trust proxy', 1);

// ─── Frontend Static Serving ────────────────────
const frontendDist = resolve(process.cwd(), 'frontend/dist');
app.use(express.static(frontendDist));

app.set('views', resolve(process.cwd(), 'src/views'));
app.set('view engine', 'ejs');

// ─── Security & Parsing ────────────────────────
app.use(helmet());
app.use(cors({ origin: config.frontendOrigin }));

// Global Rate Limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 1000, 
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, 
  legacyHeaders: false, 
});
app.use(globalLimiter);

app.use(express.json({
  verify: (req: any, _res, buf) => {
    // Save raw body for Lightspeed HMAC verification
    req.rawBody = buf;
  }
}));



app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', version: APP_VERSION, timestamp: new Date().toISOString() });
});

// ─── Routes ────────────────────────────────────
app.use('/api', apiRouter);          
app.use('/webhooks', webhookRouter); 
app.use('/auth', authRouter);        
app.use('/worker', workerRouter);    
app.use('/admin', adminRouter);      // Admin GUI (Fixed for Express 5)
app.use('/sync', syncRouter);        

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

