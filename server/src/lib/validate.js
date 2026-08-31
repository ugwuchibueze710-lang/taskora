import { z } from 'zod';
import { badRequest } from './errors.js';

/** Validates req.body against a zod schema; throws a friendly 400 on failure. */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.issues[0];
      return next(badRequest(first ? `${first.path.join('.')}: ${first.message}` : 'Invalid input.'));
    }
    req.body = result.data;
    next();
  };
}

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.');
// Intentionally permissive: Taskora does not enforce password complexity rules.
// "1234" must be accepted. We only require it not be empty, capped at a sane max.
export const passwordSchema = z.string().min(1, 'Password is required.').max(200);
