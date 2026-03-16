import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/AppError.js';
import { log } from '../lib/logger.js';

/**
 * Global error handler middleware.
 *
 * - AppError (operational): logs info, returns structured { error: { code, message } }
 * - Unknown errors (bugs): logs full object with stack, returns generic 500 in production
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError && err.isOperational) {
    // Known, expected error — log at warn level, return clean message
    log.warn(
      { code: err.code, statusCode: err.statusCode, path: req.path, method: req.method },
      err.message
    );

    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  // Unexpected programming error — log full details server-side
  log.error(
    { err, path: req.path, method: req.method },
    '[ErrorHandler] Unhandled error'
  );

  const message =
    process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
}
