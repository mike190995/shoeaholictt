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

// ─── Health Check & Landing ────────────────────
app.get('/', (_req, res) => {
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>LSWOO Middleware | Status: Active</title>
      <style>
        :root {
          --bg: #0f172a;
          --text: #f8fafc;
          --primary: #38bdf8;
          --accent: #818cf8;
        }
        body {
          margin: 0;
          font-family: 'Inter', -apple-system, sans-serif;
          background: var(--bg);
          color: var(--text);
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          overflow: hidden;
        }
        .container {
          text-align: center;
          background: rgba(30, 41, 59, 0.7);
          backdrop-filter: blur(12px);
          padding: 3rem;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          animation: fadeIn 0.8s ease-out;
        }
        h1 {
          font-size: 2.5rem;
          margin-bottom: 1rem;
          background: linear-gradient(135deg, var(--primary), var(--accent));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        p {
          font-size: 1.125rem;
          color: #94a3b8;
          max-width: 400px;
          line-height: 1.6;
        }
        .status {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(34, 197, 94, 0.1);
          color: #4ade80;
          padding: 0.5rem 1rem;
          border-radius: 9999px;
          font-weight: 600;
          font-size: 0.875rem;
          margin-bottom: 1.5rem;
        }
        .status::before {
          content: '';
          width: 8px;
          height: 8px;
          background: #4ade80;
          border-radius: 50%;
          box-shadow: 0 0 12px #4ade80;
          animation: pulse 2s infinite;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="status">System Online</div>
        <h1>LSWOO Middleware</h1>
        <p>The high-performance bridge between Lightspeed Retail and WooCommerce is active and healthy.</p>
      </div>
    </body>
    </html>
  `);
});

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
