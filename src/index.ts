import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env.js';
import { apiRouter } from './routes/api.js';
import { webhookRouter } from './routes/webhooks.js';
import { authRouter } from './routes/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// ─── Security & Parsing ────────────────────────
app.use(helmet());
app.use(cors({ origin: config.frontendOrigin }));
app.use(express.json());

// ─── Health Check (Cloud Run requirement) ──────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

import { workerRouter } from './routes/worker.js';

// ─── Routes ────────────────────────────────────
app.use('/api', apiRouter);          // GET endpoints for custom frontend
app.use('/webhooks', webhookRouter); // POST webhook receivers
app.use('/auth', authRouter);        // OAuth callback routes
app.use('/worker', workerRouter);    // Cloud tasks processing

// ─── Global Error Handler ──────────────────────
app.use(errorHandler);

// ─── Start Server ──────────────────────────────
app.listen(config.port, () => {
  console.log(`🚀 LSWOO Middleware running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
});

export default app;
