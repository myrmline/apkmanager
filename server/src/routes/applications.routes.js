import express from 'express';
import fs from 'node:fs';
import { db, transaction } from '../db.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import {
  checksumOf,
  iconMime,
  removeUpload,
  uploadApk,
  uploadIcon,
  uploadPath,
} from '../middleware/upload.js';
import { publicApplication, publicUser, publicVersion } from '../lib/serialize.js';
import { intParam } from '../lib/params.js';

const router = express.Router();
router.use(requireAuth);

const isAdmin = (req) => req.user.role === 'admin';

/* ------------------------------------------------------------------ helpers */

/**
 * Knex modifier for any query over `apk_versions as v`: narrows it to the
 * versions a non-admin may download. Three things must hold — the switch is on,
 * any expiry is still in the future, and the person is on the version's own
 * list if it has one, or on the application's list if it does not.
 */
const downloadableBy = (userId) => (qb) => {
  qb.where('v.is_active', true)
    .where((group) => group.whereNull('v.expires_at').orWhere('v.expires_at', '>', db.fn.now()))
    .where((group) => {
      group
        .whereExists((sub) =>
          sub
            .select('*')
            .from('version_access as va')
            .where('va.version_id', db.ref('v.id'))
            .where('va.user_id', userId),
        )
        .orWhere((inherited) => {
          inherited
            .whereNotExists((sub) =>
              sub.select('*').from('version_access as va').where('va.version_id', db.ref('v.id')),
            )
            .whereExists((sub) =>
              sub
                .select('*')
                .from('application_access as aa')
                .where('aa.application_id', db.ref('v.application_id'))
                .where('aa.user_id', userId),
            );
        });
    });
};

/** Same free-text search over applications aliased as `a`. */
const searchApplications = (search) => (qb) => {
  if (!search) return;
  const like = `%${search}%`;
  qb.where((group) =>
    group
      .whereILike('a.name', like)
      .orWhereILike('a.package_name', like)
      .orWhereILike('a.description', like),
  );
};

/** count(*) of the versions of the joined application that anyone could download. */
const downloadableCount = () =>
  db('apk_versions as sv')
    .count('*')
    .where('sv.application_id', db.ref('a.id'))
    .where('sv.is_active', true)
    .where((group) => group.whereNull('sv.expires_at').orWhere('sv.expires_at', '>', db.fn.now()));

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
  return [...new Set(value.map(Number).filter((v) => Number.isInteger(v) && v > 0))];
}

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === '1' || value === 1;
};

/** '' -> null, 'YYYY-MM-DD' -> end of that day, anything else parsed as given. */
function parseExpiry(value) {
  if (value === undefined || value === null || value === '' || value === 'null') return null;
  const text = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59` : text);
  if (Number.isNaN(date.getTime())) {
    throw badRequest('Enter the expiry as a date, or leave it empty.');
  }
  return date;
}

async function getApplicationOr404(id) {
  const row = await db('applications as a')
    .leftJoin('users as u', 'u.id', 'a.created_by')
    .where('a.id', id)
    .first('a.*', 'u.name as created_by_name');
  if (!row) throw notFound('That application no longer exists.');
  return row;
}

async function getVersionOr404(applicationId, versionId) {
  const row = await db('apk_versions')
    .where({ id: versionId, application_id: applicationId })
    .first();
  if (!row) throw notFound('That version no longer exists.');
  return row;
}

/** Admins see everything. Others need at least one version they can download. */
async function assertCanRead(req, application) {
  if (isAdmin(req)) return;
  if (application.status !== 'active') throw forbidden('That application is not available.');

  const reachable = await db('apk_versions as v')
    .where('v.application_id', application.id)
    .modify(downloadableBy(req.user.id))
    .first('v.id');

  if (!reachable) throw forbidden('You have not been given access to that application.');
}

const touch = (executor, id) =>
  (executor || db)('applications').where({ id }).update({ updated_at: db.fn.now() });

async function replaceAppAccess(trx, applicationId, userIds, grantedBy) {
  await trx('application_access').where({ application_id: applicationId }).del();
  if (!userIds.length) return;

  // pluck first, so only ids that are really users end up in the grant table.
  const ids = await trx('users').whereIn('id', userIds).pluck('id');
  if (!ids.length) return;

  await trx('application_access').insert(
    ids.map((userId) => ({
      application_id: applicationId,
      user_id: userId,
      granted_by: grantedBy,
    })),
  );
}

async function replaceVersionAccess(trx, versionId, userIds, grantedBy) {
  await trx('version_access').where({ version_id: versionId }).del();
  if (!userIds.length) return;

  const ids = await trx('users').whereIn('id', userIds).pluck('id');
  if (!ids.length) return;

  await trx('version_access').insert(
    ids.map((userId) => ({ version_id: versionId, user_id: userId, granted_by: grantedBy })),
  );
}

/** Clear the old flag first: a partial unique index allows only one current. */
async function markCurrent(trx, applicationId, versionId) {
  await trx('apk_versions')
    .where({ application_id: applicationId, is_current: true })
    .update({ is_current: false });
  await trx('apk_versions').where({ id: versionId }).update({ is_current: true });
}

const listAppAccess = (applicationId) =>
  db('application_access as aa')
    .join('users as u', 'u.id', 'aa.user_id')
    .where('aa.application_id', applicationId)
    .orderBy('u.name')
    .select('u.*', 'aa.granted_at');

/**
 * Versions for an admin, with the download count and the per-version access
 * list attached. Two queries and a join in memory, rather than aggregating
 * inside SQL.
 */
async function adminVersions(applicationId) {
  const versions = await db('apk_versions as v')
    .leftJoin('users as u', 'u.id', 'v.uploaded_by')
    .where('v.application_id', applicationId)
    .orderBy('v.uploaded_at', 'desc')
    .select('v.*', 'u.name as uploaded_by_name', {
      download_count: db('downloads as d').count('*').where('d.version_id', db.ref('v.id')),
    });

  if (!versions.length) return [];

  const grants = await db('version_access as va')
    .join('users as u', 'u.id', 'va.user_id')
    .whereIn(
      'va.version_id',
      versions.map((version) => version.id),
    )
    .orderBy('u.name')
    .select('va.version_id', 'u.id', 'u.name', 'u.email');

  return versions.map((version) => {
    const allowed = grants
      .filter((grant) => grant.version_id === version.id)
      .map(({ id, name, email }) => ({ id, name, email }));

    return {
      ...version,
      custom_access: allowed.length > 0,
      user_count: allowed.length,
      allowed_users: allowed,
    };
  });
}

/** One version, shaped like the admin list above (used after an access change). */
async function adminVersion(applicationId, versionId) {
  const versions = await adminVersions(applicationId);
  return versions.find((version) => version.id === versionId);
}

/* --------------------------------------------------------------------- list */

// GET /api/applications?search=&status=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();

    if (isAdmin(req)) {
      const status = ['active', 'inactive'].includes(req.query.status) ? req.query.status : null;

      const rows = await db('applications as a')
        .leftJoin('users as u', 'u.id', 'a.created_by')
        // The current version, when there is one.
        .leftJoin('apk_versions as cv', function joinCurrent() {
          this.on('cv.application_id', '=', 'a.id').andOnVal('cv.is_current', true);
        })
        .modify(searchApplications(search))
        .modify((qb) => {
          if (status) qb.where('a.status', status);
        })
        .orderBy('a.updated_at', 'desc')
        .select(
          'a.*',
          'u.name as created_by_name',
          'cv.id as current_version_id',
          'cv.version as current_version',
          'cv.size_bytes as current_version_size',
          'cv.uploaded_at as current_version_uploaded_at',
          'cv.expires_at as current_version_expires_at',
          'cv.is_active as current_version_is_active',
          {
            version_count: db('apk_versions as sv')
              .count('*')
              .where('sv.application_id', db.ref('a.id')),
            user_count: db('application_access as sa')
              .count('*')
              .where('sa.application_id', db.ref('a.id')),
            downloadable_count: downloadableCount(),
          },
        );

      return res.json({ applications: rows.map(publicApplication) });
    }

    // A user gets the versions they may download, newest first, and the
    // applications are assembled from them: one row per application, offering
    // the current version when it is reachable, otherwise the newest.
    const rows = await db('apk_versions as v')
      .join('applications as a', 'a.id', 'v.application_id')
      .where('a.status', 'active')
      .modify(downloadableBy(req.user.id))
      .modify(searchApplications(search))
      .orderBy('v.uploaded_at', 'desc')
      .select(
        'a.*',
        'v.id as version_id',
        'v.version',
        'v.size_bytes',
        'v.uploaded_at as version_uploaded_at',
        'v.expires_at',
        'v.is_active',
        'v.is_current',
      );

    const grouped = new Map();
    for (const row of rows) {
      const entry = grouped.get(row.id);
      if (!entry) {
        grouped.set(row.id, { application: row, offered: row, count: 1 });
      } else {
        entry.count += 1;
        // Rows arrive newest first, so only a current version displaces the pick.
        if (row.is_current && !entry.offered.is_current) entry.offered = row;
      }
    }

    const applications = [...grouped.values()].map(({ application, offered, count }) =>
      publicApplication({
        ...application,
        version_count: count,
        current_version_id: offered.version_id,
        current_version: offered.version,
        current_version_size: offered.size_bytes,
        current_version_uploaded_at: offered.version_uploaded_at,
        current_version_expires_at: offered.expires_at,
        current_version_is_active: offered.is_active,
      }),
    );

    res.json({ applications });
  }),
);

/* ------------------------------------------------------------------- detail */

// GET /api/applications/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const application = await getApplicationOr404(intParam(req.params.id));
    await assertCanRead(req, application);

    if (isAdmin(req)) {
      const [versions, allowed] = await Promise.all([
        adminVersions(application.id),
        listAppAccess(application.id),
      ]);

      return res.json({
        application: publicApplication(application),
        versions: versions.map(publicVersion),
        allowedUsers: allowed.map((row) => ({ ...publicUser(row), grantedAt: row.granted_at })),
      });
    }

    const versions = await db('apk_versions as v')
      .leftJoin('users as u', 'u.id', 'v.uploaded_by')
      .where('v.application_id', application.id)
      .modify(downloadableBy(req.user.id))
      .orderBy('v.uploaded_at', 'desc')
      .select('v.*', 'u.name as uploaded_by_name');

    res.json({
      application: publicApplication(application),
      versions: versions.map(publicVersion),
    });
  }),
);

// GET /api/applications/:id/icon
router.get(
  '/:id/icon',
  asyncHandler(async (req, res) => {
    const application = await getApplicationOr404(intParam(req.params.id));
    await assertCanRead(req, application);
    if (!application.icon_stored_name) throw notFound('This application has no icon.');

    const file = uploadPath(application.icon_stored_name);
    if (!fs.existsSync(file)) throw notFound('The stored icon is missing from the server.');

    res.setHeader('Content-Type', application.icon_mime || iconMime(application.icon_stored_name));
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(file).pipe(res);
  }),
);

/* -------------------------------------------------------- create and update */

function readApplicationInput(body) {
  const name = String(body.name || '').trim();
  if (!name) throw badRequest('Give the application a name.');
  return {
    name,
    package_name: String(body.packageName || '').trim() || null,
    description: String(body.description || '').trim() || null,
    status: body.status === 'inactive' ? 'inactive' : 'active',
  };
}

// POST /api/applications — multipart, optional `icon`
router.post(
  '/',
  requireAdmin,
  uploadIcon,
  asyncHandler(async (req, res) => {
    const icon = req.file;
    try {
      const input = readApplicationInput(req.body);
      const userIds = parseUserIds(req.body.userIds);

      const application = await transaction(async (trx) => {
        const [row] = await trx('applications')
          .insert({
            ...input,
            created_by: req.user.id,
            icon_stored_name: icon?.filename || null,
            icon_original_name: icon?.originalname || null,
            icon_mime: icon ? iconMime(icon.originalname) : null,
          })
          .returning('*');

        await replaceAppAccess(trx, row.id, userIds, req.user.id);
        return row;
      });

      res.status(201).json({ application: publicApplication(application) });
    } catch (err) {
      if (icon) removeUpload(icon.filename);
      throw err;
    }
  }),
);

// PUT /api/applications/:id — multipart, optional `icon`, optional removeIcon
router.put(
  '/:id',
  requireAdmin,
  uploadIcon,
  asyncHandler(async (req, res) => {
    const icon = req.file;
    try {
      const application = await getApplicationOr404(intParam(req.params.id));
      const input = readApplicationInput(req.body);
      const removeCurrentIcon = parseBool(req.body.removeIcon);
      const keepIcon = !icon && !removeCurrentIcon;

      const [row] = await db('applications')
        .where({ id: application.id })
        .update({
          ...input,
          updated_at: db.fn.now(),
          ...(keepIcon
            ? {}
            : {
                icon_stored_name: icon?.filename || null,
                icon_original_name: icon?.originalname || null,
                icon_mime: icon ? iconMime(icon.originalname) : null,
              }),
        })
        .returning('*');

      if (!keepIcon && application.icon_stored_name) removeUpload(application.icon_stored_name);
      res.json({ application: publicApplication(row) });
    } catch (err) {
      if (icon) removeUpload(icon.filename);
      throw err;
    }
  }),
);

// PATCH /api/applications/:id/status — the activate / deactivate switch
router.patch(
  '/:id/status',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const application = await getApplicationOr404(intParam(req.params.id));
    const status = parseBool(req.body.isActive, application.status === 'active')
      ? 'active'
      : 'inactive';

    const [row] = await db('applications')
      .where({ id: application.id })
      .update({ status, updated_at: db.fn.now() })
      .returning('*');

    res.json({ application: publicApplication(row) });
  }),
);

// DELETE /api/applications/:id
router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const application = await getApplicationOr404(intParam(req.params.id));

    const stored = await db('apk_versions')
      .where({ application_id: application.id })
      .pluck('stored_name');

    await db('applications').where({ id: application.id }).del();

    stored.forEach(removeUpload);
    removeUpload(application.icon_stored_name);
    res.json({ ok: true });
  }),
);

// PUT /api/applications/:id/access — replaces the application-wide list
router.put(
  '/:id/access',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const application = await getApplicationOr404(intParam(req.params.id));
    const userIds = parseUserIds(req.body.userIds);

    await transaction(async (trx) => {
      await replaceAppAccess(trx, application.id, userIds, req.user.id);
      await touch(trx, application.id);
    });

    const allowed = await listAppAccess(application.id);
    res.json({
      allowedUsers: allowed.map((row) => ({ ...publicUser(row), grantedAt: row.granted_at })),
    });
  }),
);

/* ----------------------------------------------------------------- versions */

// POST /api/applications/:id/versions — multipart `file`
router.post(
  '/:id/versions',
  requireAdmin,
  uploadApk,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Attach an .apk file.');
    const stored = req.file.filename;

    try {
      const application = await getApplicationOr404(intParam(req.params.id));
      const version = String(req.body.version || '').trim();
      if (!version) throw badRequest('Give this build a version, for example 1.0.1.');

      const duplicate = await db('apk_versions')
        .where({ application_id: application.id, version })
        .first('id');
      if (duplicate) throw conflict(`Version ${version} already exists for this app.`);

      const isActive = parseBool(req.body.isActive, true);
      const expiresAt = parseExpiry(req.body.expiresAt);
      const makeCurrent = parseBool(req.body.makeCurrent, true);
      const restrictTo = parseUserIds(req.body.userIds);
      const checksum = await checksumOf(stored);

      const created = await transaction(async (trx) => {
        const [row] = await trx('apk_versions')
          .insert({
            application_id: application.id,
            version,
            description: String(req.body.description || '').trim() || null,
            is_active: isActive,
            expires_at: expiresAt,
            original_name: req.file.originalname,
            stored_name: stored,
            size_bytes: req.file.size,
            checksum,
            uploaded_by: req.user.id,
          })
          .returning('*');

        if (restrictTo.length) {
          await replaceVersionAccess(trx, row.id, restrictTo, req.user.id);
        }
        if (makeCurrent) await markCurrent(trx, application.id, row.id);
        await touch(trx, application.id);

        return { ...row, is_current: makeCurrent, custom_access: restrictTo.length > 0 };
      });

      res.status(201).json({ version: publicVersion(created) });
    } catch (err) {
      removeUpload(stored);
      throw err;
    }
  }),
);

// PUT /api/applications/:id/versions/:versionId — version, description, switch, expiry
router.put(
  '/:id/versions/:versionId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const applicationId = intParam(req.params.id, 'That application no longer exists.');
    const existing = await getVersionOr404(applicationId, intParam(req.params.versionId));

    const version = String(req.body.version ?? existing.version).trim();
    if (!version) throw badRequest('Give this build a version, for example 1.0.1.');

    const [row] = await db('apk_versions')
      .where({ id: existing.id })
      .update({
        version,
        description: String(req.body.description ?? existing.description ?? '').trim() || null,
        is_active: parseBool(req.body.isActive, existing.is_active),
        expires_at:
          req.body.expiresAt === undefined ? existing.expires_at : parseExpiry(req.body.expiresAt),
      })
      .returning('*');

    await touch(null, applicationId);
    res.json({ version: publicVersion(row) });
  }),
);

// PUT /api/applications/:id/versions/:versionId/note — add, edit, or clear the note
router.put(
  '/:id/versions/:versionId/note',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const applicationId = intParam(req.params.id, 'That application no longer exists.');
    const existing = await getVersionOr404(applicationId, intParam(req.params.versionId));

    const note = String(req.body.note ?? '').trim();
    if (note.length > 2000) throw badRequest('Keep the note under 2000 characters.');

    const [row] = await db('apk_versions')
      .where({ id: existing.id })
      .update({ note: note || null })
      .returning('*');

    await touch(null, applicationId);
    res.json({ version: publicVersion(row) });
  }),
);

// PATCH /api/applications/:id/versions/:versionId/active — one-click switch
router.patch(
  '/:id/versions/:versionId/active',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const applicationId = intParam(req.params.id, 'That application no longer exists.');
    const existing = await getVersionOr404(applicationId, intParam(req.params.versionId));
    const isActive = parseBool(req.body.isActive, !existing.is_active);

    const [row] = await db('apk_versions')
      .where({ id: existing.id })
      .update({ is_active: isActive })
      .returning('*');

    await touch(null, applicationId);
    res.json({ version: publicVersion(row) });
  }),
);

// PUT /api/applications/:id/versions/:versionId/access
// { inherit: true } clears the override; { userIds: [...] } narrows this version.
router.put(
  '/:id/versions/:versionId/access',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const applicationId = intParam(req.params.id, 'That application no longer exists.');
    const existing = await getVersionOr404(applicationId, intParam(req.params.versionId));
    const inherit = parseBool(req.body.inherit);
    const userIds = inherit ? [] : parseUserIds(req.body.userIds);

    await transaction(async (trx) => {
      await replaceVersionAccess(trx, existing.id, userIds, req.user.id);
      await touch(trx, applicationId);
    });

    res.json({ version: publicVersion(await adminVersion(applicationId, existing.id)) });
  }),
);

// POST /api/applications/:id/versions/:versionId/current
router.post(
  '/:id/versions/:versionId/current',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const applicationId = intParam(req.params.id, 'That application no longer exists.');
    const existing = await getVersionOr404(applicationId, intParam(req.params.versionId));

    await transaction(async (trx) => {
      await markCurrent(trx, applicationId, existing.id);
      await touch(trx, applicationId);
    });

    res.json({ ok: true });
  }),
);

// DELETE /api/applications/:id/versions/:versionId
router.delete(
  '/:id/versions/:versionId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const applicationId = intParam(req.params.id, 'That application no longer exists.');
    const existing = await getVersionOr404(applicationId, intParam(req.params.versionId));

    await db('apk_versions').where({ id: existing.id }).del();
    removeUpload(existing.stored_name);

    // If the current version went away, promote the newest usable one.
    if (existing.is_current) {
      const next = await db('apk_versions as v')
        .where('v.application_id', applicationId)
        .where('v.is_active', true)
        .where((group) => group.whereNull('v.expires_at').orWhere('v.expires_at', '>', db.fn.now()))
        .orderBy('v.uploaded_at', 'desc')
        .first('v.id');

      if (next) await transaction((trx) => markCurrent(trx, applicationId, next.id));
    }

    await touch(null, applicationId);
    res.json({ ok: true });
  }),
);

/* ---------------------------------------------------------------- downloads */

async function sendVersion(req, res, versionRow) {
  const file = uploadPath(versionRow.stored_name);
  if (!fs.existsSync(file)) throw notFound('The stored build is missing from the server.');

  await db('downloads').insert({ version_id: versionRow.id, user_id: req.user.id });

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.download(file, versionRow.original_name);
}

// GET /api/applications/:id/download — the version on offer right now
router.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const application = await getApplicationOr404(intParam(req.params.id));
    await assertCanRead(req, application);

    const version = await db('apk_versions as v')
      .where('v.application_id', application.id)
      .modify((qb) => {
        if (!isAdmin(req)) qb.modify(downloadableBy(req.user.id));
      })
      .orderBy([
        { column: 'v.is_current', order: 'desc' },
        { column: 'v.uploaded_at', order: 'desc' },
      ])
      .first('v.*');

    if (!version) throw notFound('No version is available for download.');
    await sendVersion(req, res, version);
  }),
);

// GET /api/applications/:id/versions/:versionId/download
router.get(
  '/:id/versions/:versionId/download',
  asyncHandler(async (req, res) => {
    const application = await getApplicationOr404(intParam(req.params.id));
    await assertCanRead(req, application);
    const versionId = intParam(req.params.versionId, 'That version is not available for download.');

    if (isAdmin(req)) {
      return sendVersion(req, res, await getVersionOr404(application.id, versionId));
    }

    // One query, so the reason a version is unavailable — switched off, expired,
    // or not granted — never leaks through a different error message.
    const version = await db('apk_versions as v')
      .where('v.id', versionId)
      .where('v.application_id', application.id)
      .modify(downloadableBy(req.user.id))
      .first('v.*');

    if (!version) throw notFound('That version is not available for download.');
    await sendVersion(req, res, version);
  }),
);

export default router;
