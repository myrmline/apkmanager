import express from 'express';
import fs from 'node:fs';
import { pool, query, transaction } from '../db.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { checksumOf, removeUpload, uploadApk, uploadPath } from '../middleware/upload.js';
import { publicFile, publicUser, publicVersion } from '../lib/serialize.js';

const router = express.Router();
router.use(requireAuth);

const isAdmin = (req) => req.user.role === 'admin';

function parseUserIds(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = value.split(',');
    }
  }
  if (!Array.isArray(value)) value = [value];
  return [...new Set(value.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))];
}

async function getFileOr404(id) {
  const { rows } = await query(
    `SELECT f.*, u.name AS created_by_name
       FROM files f LEFT JOIN users u ON u.id = f.created_by
      WHERE f.id = $1`,
    [id],
  );
  if (!rows.length) throw notFound('That file no longer exists.');
  return rows[0];
}

/** Admins see everything; everyone else needs an explicit grant on an active file. */
async function assertCanRead(req, file) {
  if (isAdmin(req)) return;
  if (file.status !== 'active') throw forbidden('That file is not available.');
  const { rowCount } = await query(
    'SELECT 1 FROM file_access WHERE file_id = $1 AND user_id = $2',
    [file.id, req.user.id],
  );
  if (!rowCount) throw forbidden('You have not been given access to that file.');
}

async function replaceAccess(client, fileId, userIds, grantedBy) {
  await client.query('DELETE FROM file_access WHERE file_id = $1', [fileId]);
  if (!userIds.length) return;
  await client.query(
    `INSERT INTO file_access (file_id, user_id, granted_by)
     SELECT $1, u.id, $3 FROM users u WHERE u.id = ANY($2::int[])`,
    [fileId, userIds, grantedBy],
  );
}

/** Clear the old current flag first: a partial unique index allows only one. */
async function markCurrent(client, fileId, versionId) {
  await client.query(
    'UPDATE file_versions SET is_current = FALSE WHERE file_id = $1 AND is_current',
    [fileId],
  );
  await client.query('UPDATE file_versions SET is_current = TRUE WHERE id = $1', [versionId]);
}

const touchFile = (client, fileId) =>
  (client ?? { query }).query('UPDATE files SET updated_at = now() WHERE id = $1', [fileId]);

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

// GET /api/files?search=&status=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = `%${String(req.query.search || '').trim()}%`;

    if (isAdmin(req)) {
      const status = ['active', 'archived'].includes(req.query.status) ? req.query.status : null;
      const { rows } = await query(
        `SELECT f.*, u.name AS created_by_name,
                (SELECT count(*)::int FROM file_versions v WHERE v.file_id = f.id) AS version_count,
                (SELECT count(*)::int FROM file_access a WHERE a.file_id = f.id) AS user_count,
                cv.id AS current_version_id, cv.version AS current_version,
                cv.status AS current_version_status, cv.size_bytes AS current_version_size,
                cv.uploaded_at AS current_version_uploaded_at
           FROM files f
           LEFT JOIN users u ON u.id = f.created_by
           LEFT JOIN file_versions cv ON cv.file_id = f.id AND cv.is_current
          WHERE (f.name ILIKE $1 OR coalesce(f.package_name, '') ILIKE $1
                 OR coalesce(f.description, '') ILIKE $1)
            AND ($2::text IS NULL OR f.status = $2)
          ORDER BY f.updated_at DESC`,
        [search, status],
      );
      return res.json({ files: rows.map(publicFile) });
    }

    // A regular user sees active files granted to them, and the newest published
    // version of each — preferring the one the admin marked as current.
    const { rows } = await query(
      `SELECT f.*, u.name AS created_by_name,
              cv.id AS current_version_id, cv.version AS current_version,
              cv.status AS current_version_status, cv.size_bytes AS current_version_size,
              cv.uploaded_at AS current_version_uploaded_at,
              (SELECT count(*)::int FROM file_versions v
                WHERE v.file_id = f.id AND v.status = 'published') AS version_count
         FROM files f
         JOIN file_access a ON a.file_id = f.id AND a.user_id = $2
         LEFT JOIN users u ON u.id = f.created_by
         LEFT JOIN LATERAL (
              SELECT * FROM file_versions v
               WHERE v.file_id = f.id AND v.status = 'published'
               ORDER BY v.is_current DESC, v.uploaded_at DESC
               LIMIT 1
         ) cv ON TRUE
        WHERE f.status = 'active'
          AND (f.name ILIKE $1 OR coalesce(f.package_name, '') ILIKE $1
               OR coalesce(f.description, '') ILIKE $1)
        ORDER BY cv.uploaded_at DESC NULLS LAST, f.name`,
      [search, req.user.id],
    );
    res.json({ files: rows.map(publicFile) });
  }),
);

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

// GET /api/files/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const file = await getFileOr404(Number(req.params.id));
    await assertCanRead(req, file);
    const admin = isAdmin(req);

    const versions = await query(
      `SELECT v.*, u.name AS uploaded_by_name,
              (SELECT count(*)::int FROM downloads d WHERE d.version_id = v.id) AS download_count
         FROM file_versions v
         LEFT JOIN users u ON u.id = v.uploaded_by
        WHERE v.file_id = $1 AND ($2 OR v.status = 'published')
        ORDER BY v.uploaded_at DESC`,
      [file.id, admin],
    );

    const payload = {
      file: publicFile(file),
      versions: versions.rows.map(publicVersion),
    };

    if (admin) {
      const access = await query(
        `SELECT u.*, a.granted_at
           FROM file_access a JOIN users u ON u.id = a.user_id
          WHERE a.file_id = $1
          ORDER BY u.name`,
        [file.id],
      );
      payload.allowedUsers = access.rows.map((row) => ({
        ...publicUser(row),
        grantedAt: row.granted_at,
      }));
    }

    res.json(payload);
  }),
);

// ---------------------------------------------------------------------------
// Create / update / delete a file
// ---------------------------------------------------------------------------

// POST /api/files — multipart: file, name, packageName, description, version, notes, userIds
router.post(
  '/',
  requireAdmin,
  uploadApk,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Attach an .apk file.');
    const stored = req.file.filename;

    try {
      const name = String(req.body.name || '').trim();
      const version = String(req.body.version || '').trim();
      if (!name) throw badRequest('Give the file a name.');
      if (!version) throw badRequest('Give this build a version, for example 1.0.0.');

      const status = req.body.status === 'archived' ? 'archived' : 'active';
      const versionStatus = req.body.versionStatus === 'draft' ? 'draft' : 'published';
      const userIds = parseUserIds(req.body.userIds);
      const checksum = await checksumOf(stored);

      const result = await transaction(async (client) => {
        const fileRow = (
          await client.query(
            `INSERT INTO files (name, package_name, description, status, created_by)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [
              name,
              String(req.body.packageName || '').trim() || null,
              String(req.body.description || '').trim() || null,
              status,
              req.user.id,
            ],
          )
        ).rows[0];

        const versionRow = (
          await client.query(
            `INSERT INTO file_versions
               (file_id, version, notes, status, is_current, original_name, stored_name,
                size_bytes, checksum, uploaded_by)
             VALUES ($1, $2, $3, $4, $10, $5, $6, $7, $8, $9) RETURNING *`,
            [
              fileRow.id,
              version,
              String(req.body.notes || '').trim() || null,
              versionStatus,
              req.file.originalname,
              stored,
              req.file.size,
              checksum,
              req.user.id,
              versionStatus === 'published',
            ],
          )
        ).rows[0];

        await replaceAccess(client, fileRow.id, userIds, req.user.id);
        return { file: publicFile(fileRow), version: publicVersion(versionRow) };
      });

      res.status(201).json(result);
    } catch (err) {
      removeUpload(stored);
      throw err;
    }
  }),
);

// PUT /api/files/:id
router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const file = await getFileOr404(Number(req.params.id));
    const name = String(req.body.name || '').trim();
    if (!name) throw badRequest('Give the file a name.');

    const { rows } = await query(
      `UPDATE files
          SET name = $1, package_name = $2, description = $3, status = $4, updated_at = now()
        WHERE id = $5 RETURNING *`,
      [
        name,
        String(req.body.packageName || '').trim() || null,
        String(req.body.description || '').trim() || null,
        req.body.status === 'archived' ? 'archived' : 'active',
        file.id,
      ],
    );
    res.json({ file: publicFile(rows[0]) });
  }),
);

// DELETE /api/files/:id — removes the versions, grants, and stored binaries.
router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const file = await getFileOr404(Number(req.params.id));
    const stored = await query('SELECT stored_name FROM file_versions WHERE file_id = $1', [
      file.id,
    ]);
    await query('DELETE FROM files WHERE id = $1', [file.id]);
    stored.rows.forEach((row) => removeUpload(row.stored_name));
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Access management
// ---------------------------------------------------------------------------

// PUT /api/files/:id/access — { userIds: [1, 2, 3] } replaces the whole list.
router.put(
  '/:id/access',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const file = await getFileOr404(Number(req.params.id));
    const userIds = parseUserIds(req.body.userIds);

    await transaction(async (client) => {
      await replaceAccess(client, file.id, userIds, req.user.id);
      await touchFile(client, file.id);
    });

    const { rows } = await query(
      `SELECT u.*, a.granted_at
         FROM file_access a JOIN users u ON u.id = a.user_id
        WHERE a.file_id = $1 ORDER BY u.name`,
      [file.id],
    );
    res.json({
      allowedUsers: rows.map((row) => ({ ...publicUser(row), grantedAt: row.granted_at })),
    });
  }),
);

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

// POST /api/files/:id/versions — multipart: file, version, notes, versionStatus, makeCurrent
router.post(
  '/:id/versions',
  requireAdmin,
  uploadApk,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Attach an .apk file.');
    const stored = req.file.filename;

    try {
      const file = await getFileOr404(Number(req.params.id));
      const version = String(req.body.version || '').trim();
      if (!version) throw badRequest('Give this build a version, for example 1.0.1.');

      const duplicate = await query(
        'SELECT 1 FROM file_versions WHERE file_id = $1 AND version = $2',
        [file.id, version],
      );
      if (duplicate.rowCount) throw conflict(`Version ${version} already exists for this file.`);

      const status = req.body.versionStatus === 'draft' ? 'draft' : 'published';
      const makeCurrent = status === 'published' && req.body.makeCurrent !== 'false';
      const checksum = await checksumOf(stored);

      const versionRow = await transaction(async (client) => {
        const row = (
          await client.query(
            `INSERT INTO file_versions
               (file_id, version, notes, status, original_name, stored_name, size_bytes,
                checksum, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [
              file.id,
              version,
              String(req.body.notes || '').trim() || null,
              status,
              req.file.originalname,
              stored,
              req.file.size,
              checksum,
              req.user.id,
            ],
          )
        ).rows[0];

        if (makeCurrent) await markCurrent(client, file.id, row.id);
        await touchFile(client, file.id);
        return { ...row, is_current: makeCurrent };
      });

      res.status(201).json({ version: publicVersion(versionRow) });
    } catch (err) {
      removeUpload(stored);
      throw err;
    }
  }),
);

// PUT /api/files/:id/versions/:versionId — edit version metadata
router.put(
  '/:id/versions/:versionId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const fileId = Number(req.params.id);
    const versionId = Number(req.params.versionId);
    const existing = await query('SELECT * FROM file_versions WHERE id = $1 AND file_id = $2', [
      versionId,
      fileId,
    ]);
    if (!existing.rowCount) throw notFound('That version no longer exists.');

    const version = String(req.body.version || existing.rows[0].version).trim();
    const status = ['draft', 'published', 'archived'].includes(req.body.status)
      ? req.body.status
      : existing.rows[0].status;
    if (status !== 'published' && existing.rows[0].is_current) {
      throw badRequest('Mark another version as current before changing this one.');
    }

    const { rows } = await query(
      `UPDATE file_versions SET version = $1, notes = $2, status = $3 WHERE id = $4 RETURNING *`,
      [version, String(req.body.notes || '').trim() || null, status, versionId],
    );
    await touchFile(null, fileId);
    res.json({ version: publicVersion(rows[0]) });
  }),
);

// POST /api/files/:id/versions/:versionId/current
router.post(
  '/:id/versions/:versionId/current',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const fileId = Number(req.params.id);
    const versionId = Number(req.params.versionId);
    const existing = await query('SELECT * FROM file_versions WHERE id = $1 AND file_id = $2', [
      versionId,
      fileId,
    ]);
    if (!existing.rowCount) throw notFound('That version no longer exists.');
    if (existing.rows[0].status !== 'published') {
      throw badRequest('Publish this version before making it current.');
    }

    await transaction(async (client) => {
      await markCurrent(client, fileId, versionId);
      await touchFile(client, fileId);
    });
    res.json({ ok: true });
  }),
);

// DELETE /api/files/:id/versions/:versionId
router.delete(
  '/:id/versions/:versionId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const fileId = Number(req.params.id);
    const versionId = Number(req.params.versionId);
    const existing = await query('SELECT * FROM file_versions WHERE id = $1 AND file_id = $2', [
      versionId,
      fileId,
    ]);
    if (!existing.rowCount) throw notFound('That version no longer exists.');

    const remaining = await query(
      'SELECT count(*)::int AS count FROM file_versions WHERE file_id = $1',
      [fileId],
    );
    if (remaining.rows[0].count <= 1) {
      throw badRequest('A file needs at least one version. Delete the file instead.');
    }

    await query('DELETE FROM file_versions WHERE id = $1', [versionId]);
    removeUpload(existing.rows[0].stored_name);

    // If the current version went away, promote the newest published build.
    if (existing.rows[0].is_current) {
      const next = await query(
        `SELECT id FROM file_versions
          WHERE file_id = $1 AND status = 'published'
          ORDER BY uploaded_at DESC LIMIT 1`,
        [fileId],
      );
      if (next.rowCount) {
        await transaction((client) => markCurrent(client, fileId, next.rows[0].id));
      }
    }
    await touchFile(null, fileId);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

async function sendVersion(req, res, versionRow) {
  const path = uploadPath(versionRow.stored_name);
  if (!fs.existsSync(path)) throw notFound('The stored build is missing from the server.');

  await pool.query('INSERT INTO downloads (version_id, user_id) VALUES ($1, $2)', [
    versionRow.id,
    req.user.id,
  ]);

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.download(path, versionRow.original_name);
}

// GET /api/files/:id/download — the version the admin marked as current
router.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const file = await getFileOr404(Number(req.params.id));
    await assertCanRead(req, file);

    const { rows } = await query(
      `SELECT * FROM file_versions
        WHERE file_id = $1 AND ($2 OR status = 'published')
        ORDER BY is_current DESC, uploaded_at DESC LIMIT 1`,
      [file.id, isAdmin(req)],
    );
    if (!rows.length) throw notFound('No downloadable build yet.');
    await sendVersion(req, res, rows[0]);
  }),
);

// GET /api/files/:id/versions/:versionId/download
router.get(
  '/:id/versions/:versionId/download',
  asyncHandler(async (req, res) => {
    const file = await getFileOr404(Number(req.params.id));
    await assertCanRead(req, file);

    const { rows } = await query(
      `SELECT * FROM file_versions
        WHERE id = $1 AND file_id = $2 AND ($3 OR status = 'published')`,
      [Number(req.params.versionId), file.id, isAdmin(req)],
    );
    if (!rows.length) throw notFound('That version is not available to you.');
    await sendVersion(req, res, rows[0]);
  }),
);

export default router;
