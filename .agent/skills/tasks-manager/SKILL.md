---
name: tasks-manager
description: Decouples incoming webhooks from heavy processing using GCP Cloud Tasks with rate limiting and retries.
---

# Cloud Tasks Webhook Manager

Decouple incoming webhooks from heavy processing using GCP Cloud Tasks.

## Webhook Flow

The endpoint `/webhooks/woo` (and `/webhooks/lightspeed`) **must respond with `200 OK` within 200ms**.

1. Receive the webhook payload.
2. Validate the request (signature, required fields).
3. Check Redis for loop prevention (see `redis-protector` skill).
4. Immediately enqueue a Cloud Task using the `@google-cloud/tasks` SDK.
5. Respond `200 OK` with `{ "received": true }`.

## Cloud Task Configuration

```bash
gcloud tasks queues create inventory-sync-queue \
  --max-dispatches-per-second=2 \
  --max-concurrent-dispatches=5 \
  --max-attempts=5 \
  --min-backoff=10s \
  --max-backoff=300s
```

- `maxDispatchesPerSecond: 2` — Respects Lightspeed and WooCommerce rate limits (2–5 req/s).
- `maxConcurrentDispatches: 5` — Prevents overwhelming the Worker service.
- Automatic retries with exponential backoff — Handles `503` and `429` errors.

## Task Payload

```json
{
  "direction": "woo_to_ls",
  "payload": { /* original webhook data */ },
  "timestamp": "2026-03-08T14:00:00.000Z"
}
```

## Files to Modify

- `src/routes/webhooks.ts` — Webhook receivers
- `src/lib/tasks.ts` — Cloud Tasks enqueue helper
