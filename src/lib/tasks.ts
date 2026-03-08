/**
 * Cloud Tasks Helper
 *
 * Enqueues sync tasks into the GCP Cloud Tasks queue.
 * Architecture §2C: "Cloud Tasks acts as a Buffer"
 * - maxDispatchesPerSecond: 2.0
 * - maxConcurrentDispatches: 5
 * - Automatic retries with exponential backoff
 */

import { CloudTasksClient } from '@google-cloud/tasks';
import { config } from '../config/env.js';

const tasksClient = new CloudTasksClient();

/**
 * Enqueue a sync task into the Cloud Tasks queue.
 * The task will be dispatched to the Worker Cloud Run service.
 */
export async function enqueueTask(
  direction: string,
  payload: Record<string, unknown>
): Promise<string> {
  const parent = tasksClient.queuePath(
    config.gcpProjectId,
    config.cloudTasksLocation,
    config.cloudTasksQueue
  );

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: `${config.workerServiceUrl}/process`,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(
        JSON.stringify({ direction, payload, timestamp: new Date().toISOString() })
      ).toString('base64'),
    },
  };

  const [response] = await tasksClient.createTask({ parent, task });
  console.log(`[Tasks] Enqueued: ${response.name}`);

  return response.name || '';
}
