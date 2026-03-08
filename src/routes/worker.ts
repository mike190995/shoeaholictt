import { Router } from 'express';
import { processSyncTask } from '../services/sync.js';

export const workerRouter = Router();

/**
 * POST /worker/process
 *
 * Internal endpoint called by GCP Cloud Tasks.
 * This is the Worker component defined in Architecture §2A.
 */
workerRouter.post('/process', async (req, res, next) => {
  try {
    const task = req.body;

    // Validate the incoming task payload
    if (!task || !task.direction || !task.payload) {
      res.status(400).json({ error: 'Missing direction or payload' });
      return;
    }

    // Process the sync task (e.g. ls_to_woo, woo_to_ls, site_to_ls)
    await processSyncTask(task);

    res.status(200).json({ success: true });
  } catch (err) {
    // Let the global error handler log it and return 500,
    // which tells Cloud Tasks to backoff and retry.
    next(err);
  }
});
