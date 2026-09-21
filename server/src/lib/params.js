import { notFound } from './http.js';

/**
 * Route ids are integers. A non-numeric id is a missing record, not a server
 * error, so it never reaches the database as an invalid integer.
 */
export function intParam(value, message = 'Not found.') {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw notFound(message);
  return id;
}
