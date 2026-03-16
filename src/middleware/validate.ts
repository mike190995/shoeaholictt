import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Express middleware to validate request body against a Zod schema.
 * Rejects malformed payloads with a 400 Bad Request before they reach the controller.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse the incoming body against the schema
      // This will throw a ZodError if validation fails
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        // Return a structured 400 error detailing the validation failures
        res.status(400).json({
          error: 'Validation failed',
          issues: err.issues.map((e: any) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      } else {
        next(err);
      }
    }
  };
}
