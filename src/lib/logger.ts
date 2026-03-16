/**
 * Shared Pino Logger
 *
 * - Development: pretty-printed, colorized output
 * - Production: structured JSON (parses natively in GCP Cloud Logging)
 *
 * Usage: import { log } from '../lib/logger.js'
 *        log.info('sync complete', { sku, direction })
 */

import pino from 'pino';
import { config } from '../config/env.js';

const isDev = config.nodeEnv !== 'production';

export const log = pino(
  {
    level: isDev ? 'debug' : 'info',
    // Map pino log levels to GCP Cloud Logging severity
    formatters: {
      level(label) {
        return { severity: label.toUpperCase() };
      },
    },
    base: { service: 'lswoo-middleware' },
  },
  isDev
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname,service',
        },
      })
    : undefined
);
