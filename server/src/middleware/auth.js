import jwt from 'jsonwebtoken';
import { config } from '../lib/config.js';
import { query } from '../db.js';
import { asyncHandler, forbidden, unauthorized } from '../lib/http.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  // Allows <a href> style downloads when a header cannot be set.
  if (typeof req.query.token === 'string') return req.query.token;
  return null;
}

/**
 * Verifies the token and reloads the user from the database on every request,
 * so a role change or deactivation takes effect immediately.
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = readToken(req);
  if (!token) throw unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Your session has expired. Sign in again.');
  }

  const { rows } = await query(
    'SELECT id, name, email, role, is_active FROM users WHERE id = $1',
    [payload.sub],
  );
  const user = rows[0];
  if (!user) throw unauthorized('This account no longer exists.');
  if (!user.is_active) throw forbidden('This account has been deactivated.');

  req.user = user;
  next();
});

export const requireAdmin = (req, _res, next) => {
  if (req.user?.role !== 'admin') return next(forbidden('Admins only.'));
  next();
};
