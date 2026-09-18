import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { asyncHandler, badRequest, conflict, notFound } from '../lib/http.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { publicUser } from '../lib/serialize.js';

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
  const { rows } = await query(
    `SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND is_active AND id <> $1`,
    [userId],
  );
  if (rows[0].count === 0) throw badRequest('Keep at least one active admin.');
}

// GET /api/users?search=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = `%${String(req.query.search || '').trim()}%`;
    const { rows } = await query(
      `SELECT u.*,
              (SELECT count(*)::int FROM file_access a WHERE a.user_id = u.id) AS file_count
         FROM users u
        WHERE ($1 = '%%' OR u.name ILIKE $1 OR u.email ILIKE $1)
        ORDER BY u.role, u.name`,
      [search],
    );
    res.json({
      users: rows.map((row) => ({ ...publicUser(row), fileCount: row.file_count })),
    });
  }),
);

// POST /api/users
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = readUserInput(req.body, { requirePassword: true });
    const exists = await query('SELECT 1 FROM users WHERE lower(email) = $1', [input.email]);
    if (exists.rowCount) throw conflict('Another account already uses that email.');

    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.name, input.email, await bcrypt.hash(input.password, 10), input.role, input.isActive],
    );
    res.status(201).json({ user: publicUser(rows[0]) });
  }),
);

// PUT /api/users/:id
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (!existing.rowCount) throw notFound('That user no longer exists.');

    const input = readUserInput(req.body, { requirePassword: false });
    const clash = await query('SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2', [
      input.email,
      id,
    ]);
    if (clash.rowCount) throw conflict('Another account already uses that email.');

    if (id === req.user.id && (input.role !== 'admin' || !input.isActive)) {
      throw badRequest('You cannot remove your own admin access.');
    }
    await assertAdminRemains(id, input);

    const { rows } = await query(
      `UPDATE users
          SET name = $1,
              email = $2,
              role = $3,
              is_active = $4,
              password_hash = COALESCE($5, password_hash),
              updated_at = now()
        WHERE id = $6
      RETURNING *`,
      [
        input.name,
        input.email,
        input.role,
        input.isActive,
        input.password ? await bcrypt.hash(input.password, 10) : null,
        id,
      ],
    );
    res.json({ user: publicUser(rows[0]) });
  }),
);

// DELETE /api/users/:id — access rows cascade away with the user.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw badRequest('You cannot delete your own account.');

    const existing = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (!existing.rowCount) throw notFound('That user no longer exists.');
    await assertAdminRemains(id, { role: 'user', isActive: false });

    await query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ ok: true });
  }),
);

export default router;
