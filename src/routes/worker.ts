import { Router, Request, Response, NextFunction } from 'express';
import { processSyncTask } from '../services/sync.js';
import { config } from '../config/env.js';
import { AppError } from '../lib/AppError.js';
import { log } from '../lib/logger.js';

export const workerRouter = Router();

/**
 * Middleware: verify the shared Worker Secret header.
 * Cloud Tasks passes X-Worker-Secret when dispatching tasks.
 * Any other caller without the secret gets a 401.
 */
function verifyWorkerSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-worker-secret'];
  if (!config.workerSecret || secret !== config.workerSecret) {
    log.warn({ path: req.path, ip: req.ip }, '[Worker] Unauthorized request — invalid secret');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

/**
 * POST /worker/process
 *
 * Internal endpoint called by GCP Cloud Tasks.
 * This is the Worker component defined in Architecture §2A.
 */
workerRouter.post('/process', verifyWorkerSecret, async (req, res, next) => {
  try {
    const task = req.body;

    if (!task || !task.direction || !task.payload) {
      throw AppError.badRequest('Missing direction or payload in task body');
    }

    log.info({ direction: task.direction }, '[Worker] Processing sync task');
    await processSyncTask(task);
    log.info({ direction: task.direction }, '[Worker] Sync task complete');

    res.status(200).json({ success: true });
  } catch (err) {
    // Let the global error handler log it and return 500,
    // which tells Cloud Tasks to backoff and retry.
    next(err);
  }
});
