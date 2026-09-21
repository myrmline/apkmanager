import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { asyncHandler, badRequest, conflict, notFound } from '../lib/http.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { publicUser } from '../lib/serialize.js';
import { intParam } from '../lib/params.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readUserInput(body, { requirePassword }) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const role = body.role === 'admin' ? 'admin' : 'user';
  const password = body.password ? String(body.password) : '';
  const isActive = body.isActive === undefined ? true : Boolean(body.isActive);

  if (name.length < 2) throw badRequest('Enter the person’s name.');
  if (!EMAIL_RE.test(email)) throw badRequest('Enter a valid email address.');
  // On update an empty password means "keep the current one".
  if ((requirePassword || password) && password.length < 8) {
    throw badRequest('Use a password of at least 8 characters.');
  }

  return { name, email, role, password, isActive };
}

/** Refuse a change that would leave nobody able to administer the system. */
async function assertAdminRemains(userId, { role, isActive }) {
  if (role === 'admin' && isActive) return;
  const [{ count }] = await db('users')
    .where({ role: 'admin', is_active: true })
    .whereNot({ id: userId })
    .count({ count: '*' });
  if (!count) throw badRequest('Keep at least one active admin.');
}

const withGrantCounts = (qb) =>
  qb.select({
    grant_count: db('application_access as aa')
      .count('*')
      .where('aa.user_id', db.ref('u.id')),
    version_grant_count: db('version_access as va')
      .count('*')
      .where('va.user_id', db.ref('u.id')),
  });

const serialize = (row) => ({
  ...publicUser(row),
  grantCount: (row.grant_count || 0) + (row.version_grant_count || 0),
});

// GET /api/users?search=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();

    const rows = await db('users as u')
      .select('u.*')
      .modify(withGrantCounts)
      .modify((qb) => {
        if (!search) return;
        const like = `%${search}%`;
        qb.where((group) => group.whereILike('u.name', like).orWhereILike('u.email', like));
      })
      .orderBy(['u.role', 'u.name']);

    res.json({ users: rows.map(serialize) });
  }),
);

// POST /api/users
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = readUserInput(req.body, { requirePassword: true });

    const exists = await db('users').where({ email: input.email }).first('id');
    if (exists) throw conflict('Another account already uses that email.');

    const [row] = await db('users')
      .insert({
        name: input.name,
        email: input.email,
        password_hash: await bcrypt.hash(input.password, 10),
        role: input.role,
        is_active: input.isActive,
      })
      .returning('*');

    res.status(201).json({ user: publicUser(row) });
  }),
);

// PUT /api/users/:id
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id, 'That user no longer exists.');
    const existing = await db('users').where({ id }).first();
    if (!existing) throw notFound('That user no longer exists.');

    const input = readUserInput(req.body, { requirePassword: false });

    const clash = await db('users').where({ email: input.email }).whereNot({ id }).first('id');
    if (clash) throw conflict('Another account already uses that email.');

    if (id === req.user.id && (input.role !== 'admin' || !input.isActive)) {
      throw badRequest('You cannot remove your own admin access.');
    }
    await assertAdminRemains(id, input);

    const [row] = await db('users')
      .where({ id })
      .update({
        name: input.name,
        email: input.email,
        role: input.role,
        is_active: input.isActive,
        updated_at: db.fn.now(),
        // Only touched when a new password was supplied.
        ...(input.password ? { password_hash: await bcrypt.hash(input.password, 10) } : {}),
      })
      .returning('*');

    res.json({ user: publicUser(row) });
  }),
);

// PATCH /api/users/:id/active — the enable / disable switch on the people list
router.patch(
  '/:id/active',
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id, 'That user no longer exists.');
    const existing = await db('users').where({ id }).first();
    if (!existing) throw notFound('That user no longer exists.');

    const isActive = req.body.isActive === undefined ? !existing.is_active : Boolean(req.body.isActive);

    if (id === req.user.id && !isActive) throw badRequest('You cannot disable your own account.');
    await assertAdminRemains(id, { role: existing.role, isActive });

    const [row] = await db('users')
      .where({ id })
      .update({ is_active: isActive, updated_at: db.fn.now() })
      .returning('*');

    res.json({ user: publicUser(row) });
  }),
);

// DELETE /api/users/:id — access rows cascade away with the user.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id, 'That user no longer exists.');
    if (id === req.user.id) throw badRequest('You cannot delete your own account.');

    const existing = await db('users').where({ id }).first('id');
    if (!existing) throw notFound('That user no longer exists.');
    await assertAdminRemains(id, { role: 'user', isActive: false });

    await db('users').where({ id }).del();
    res.json({ ok: true });
  }),
);

export default router;
