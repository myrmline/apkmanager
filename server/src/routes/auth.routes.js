import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { asyncHandler, badRequest, unauthorized } from '../lib/http.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { publicUser } from '../lib/serialize.js';

const router = express.Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) throw badRequest('Enter an email and password.');

    const { rows } = await query('SELECT * FROM users WHERE lower(email) = $1', [email]);
    const user = rows[0];
    // Same message either way, so the response does not reveal which emails exist.
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw unauthorized('That email and password do not match.');
    }
    if (!user.is_active) throw unauthorized('This account has been deactivated.');

    res.json({ token: signToken(user), user: publicUser(user) });
  }),
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.put(
  '/me/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 8) throw badRequest('Use at least 8 characters.');

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      throw badRequest('Your current password is not correct.');
    }

    await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
      await bcrypt.hash(newPassword, 10),
      req.user.id,
    ]);
    res.json({ ok: true });
  }),
);

export default router;
