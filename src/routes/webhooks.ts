import { Router } from 'express';

export const webhookRouter = Router();

/**
 * POST /webhooks/woo
 * Receives WooCommerce webhooks.
 * Must respond with 200 OK within 200ms (Architecture §2C).
 * Immediately enqueues a Cloud Task for async processing.
 */
webhookRouter.post('/woo', async (req, res, next) => {
  try {
    // const payload = req.body; // TODO: use in validation and enqueue

    // TODO: Validate webhook signature
    // TODO: Check Redis for loop prevention (Architecture §2D)
    // TODO: Enqueue Cloud Task for inventory sync
    // await enqueueTask('woo_to_ls', payload);

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /webhooks/lightspeed
 * Receives Lightspeed Retail webhooks.
 * Same pattern: validate → deduplicate → enqueue.
 */
webhookRouter.post('/lightspeed', async (req, res, next) => {
  try {
    // const payload = req.body; // TODO: use in validation and enqueue

    // TODO: Validate webhook authenticity
    // TODO: Check Redis for loop prevention
    // TODO: Enqueue Cloud Task for inventory sync
    // await enqueueTask('ls_to_woo', payload);

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
});
