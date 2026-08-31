export class AppError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (msg = 'Not found') => new AppError(msg, 404, 'NOT_FOUND');
export const forbidden = (msg = 'Forbidden') => new AppError(msg, 403, 'FORBIDDEN');
export const unauthorized = (msg = 'Unauthorized') => new AppError(msg, 401, 'UNAUTHORIZED');
export const badRequest = (msg = 'Bad request') => new AppError(msg, 400, 'BAD_REQUEST');
export const conflict = (msg = 'Conflict') => new AppError(msg, 409, 'CONFLICT');

export function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}
