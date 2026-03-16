/**
 * Typed Application Error
 *
 * Distinguishes operational errors (expected, safe to surface to client)
 * from programming bugs (should be logged in full, masked in response).
 *
 * Usage: throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND')
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  /** Operational errors are expected failures (e.g. 404, 409). Non-operational are bugs. */
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    isOperational = true
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    // Capture stack trace, excluding the constructor itself
    Error.captureStackTrace(this, this.constructor);
  }

  static notFound(resource: string): AppError {
    return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
  }

  static badRequest(message: string): AppError {
    return new AppError(message, 400, 'BAD_REQUEST');
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409, 'CONFLICT');
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }
}
