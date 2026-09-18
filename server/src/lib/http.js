export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Sign in to continue.') => new HttpError(401, msg);
export const forbidden = (msg = 'You do not have access to this.') => new HttpError(403, msg);
export const notFound = (msg = 'Not found.') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

/** Wrap an async handler so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.code === '23505') {
    // unique_violation
    return res.status(409).json({ error: 'That value is already taken.' });
  }
  if (err.code === '23503' || err.code === '23514') {
    // foreign_key_violation / check_violation
    return res.status(400).json({ error: 'That change conflicts with existing data.' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'The file is larger than the upload limit.' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong on the server.' });
}
