import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { asyncHandler, badRequest, unauthorized } from '../lib/http.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { publicUser } from '../lib/serialize.js';

const router = express.Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    // Emails are stored lowercased on every write, so a lowercased lookup is
    // exact and uses the unique index.
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) throw badRequest('Enter an email and password.');

    const user = await db('users').where({ email }).first();
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

    const { password_hash: hash } = await db('users')
      .where({ id: req.user.id })
      .first('password_hash');

    if (!(await bcrypt.compare(currentPassword, hash))) {
      throw badRequest('Your current password is not correct.');
    }

    await db('users')
      .where({ id: req.user.id })
      .update({ password_hash: await bcrypt.hash(newPassword, 10), updated_at: db.fn.now() });

    res.json({ ok: true });
  }),
);

export default router;
