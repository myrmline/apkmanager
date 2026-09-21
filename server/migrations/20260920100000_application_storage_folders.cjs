const fs = require('node:fs');
const path = require('node:path');
const { slugify, safeFileName } = require('../src/lib/slug.cjs');

require('dotenv').config();

/**
 * Per-application folders under public/.
 *
 * Before: every APK and icon sat flat in uploads/ under a random name.
 * After:  public/{application}/icon.ext
 *         public/{application}/apks/{version}.apk
 *         public/{application}/assets/
 *
 * The database keeps the folder name (applications.storage_dir) and each file's
 * name inside it. Because file names are now only unique within one
 * application, the global UNIQUE on stored_name becomes UNIQUE per application.
 *
 * Files are moved, not copied. If anything fails part-way, the moves already
 * made are reversed before the error propagates, and Knex rolls back the
 * schema changes — disk and database end up where they started.
 */

const serverRoot = path.resolve(__dirname, '..');
const STORAGE = path.resolve(serverRoot, process.env.STORAGE_DIR || 'public');
const LEGACY = path.resolve(serverRoot, process.env.UPLOAD_DIR || 'uploads');

function uniqueName(dir, desired) {
  const ext = path.extname(desired);
  const stem = desired.slice(0, desired.length - ext.length);
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? desired : `${stem}-${n}${ext}`;
    if (!fs.existsSync(path.join(dir, candidate))) return candidate;
  }
}

function moveFile(from, to, moved) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
  moved.push([from, to]);
}

function undo(moved) {
  for (const [from, to] of moved.reverse()) {
    try {
      fs.mkdirSync(path.dirname(from), { recursive: true });
      fs.renameSync(to, from);
    } catch (err) {
      console.error(`Could not move ${to} back to ${from}: ${err.message}`);
    }
  }
}

exports.up = async (knex) => {
  await knex.schema.alterTable('applications', (table) => {
    table.text('storage_dir').unique();
  });

  // Created as UNIQUE on file_versions.stored_name, and the name survived the
  // table rename. Per-application uniqueness replaces it.
  await knex.schema.alterTable('apk_versions', (table) => {
    table.dropUnique(['stored_name'], 'file_versions_stored_name_unique');
    table.unique(['application_id', 'stored_name'], {
      indexName: 'apk_versions_file_unique',
    });
  });

  fs.mkdirSync(STORAGE, { recursive: true });

  const applications = await knex('applications').orderBy('id');
  const taken = new Set(fs.readdirSync(STORAGE));
  const moved = [];
  const missing = [];

  try {
    for (const application of applications) {
      let dir = slugify(application.name);
      for (let n = 2; taken.has(dir); n += 1) dir = `${slugify(application.name)}-${n}`;
      taken.add(dir);

      const appRoot = path.join(STORAGE, dir);
      fs.mkdirSync(path.join(appRoot, 'apks'), { recursive: true });
      fs.mkdirSync(path.join(appRoot, 'assets'), { recursive: true });

      let icon = null;
      if (application.icon_stored_name) {
        const from = path.join(LEGACY, application.icon_stored_name);
        if (fs.existsSync(from)) {
          icon = `icon${path.extname(application.icon_stored_name).toLowerCase() || '.png'}`;
          moveFile(from, path.join(appRoot, icon), moved);
        } else {
          missing.push(from);
        }
      }

      await knex('applications')
        .where({ id: application.id })
        .update({ storage_dir: dir, icon_stored_name: icon });

      const versions = await knex('apk_versions').where({ application_id: application.id });
      for (const version of versions) {
        const from = path.join(LEGACY, version.stored_name);
        if (!fs.existsSync(from)) {
          missing.push(from);
          continue;
        }
        const apkDir = path.join(appRoot, 'apks');
        const name = uniqueName(apkDir, `${safeFileName(version.version, `version-${version.id}`)}.apk`);
        moveFile(from, path.join(apkDir, name), moved);
        await knex('apk_versions').where({ id: version.id }).update({ stored_name: name });
      }
    }
  } catch (err) {
    undo(moved);
    throw err;
  }

  await knex.schema.alterTable('applications', (table) => {
    table.text('storage_dir').notNullable().alter();
  });

  if (moved.length) console.log(`Moved ${moved.length} file(s) from ${LEGACY} into ${STORAGE}.`);
  if (missing.length) {
    console.warn(`${missing.length} file(s) were already missing and could not be moved:`);
    missing.forEach((file) => console.warn(`  ${file}`));
  }
};

exports.down = async (knex) => {
  const applications = await knex('applications').orderBy('id');
  fs.mkdirSync(LEGACY, { recursive: true });
  const moved = [];

  try {
    for (const application of applications) {
      const appRoot = path.join(STORAGE, application.storage_dir);

      let icon = null;
      if (application.icon_stored_name) {
        const from = path.join(appRoot, application.icon_stored_name);
        if (fs.existsSync(from)) {
          icon = uniqueName(LEGACY, `${application.storage_dir}-${application.icon_stored_name}`);
          moveFile(from, path.join(LEGACY, icon), moved);
        }
      }
      await knex('applications').where({ id: application.id }).update({ icon_stored_name: icon });

      const versions = await knex('apk_versions').where({ application_id: application.id });
      for (const version of versions) {
        const from = path.join(appRoot, 'apks', version.stored_name);
        // Old layout needs globally unique names again.
        const name = uniqueName(LEGACY, `${application.storage_dir}-${version.stored_name}`);
        if (fs.existsSync(from)) moveFile(from, path.join(LEGACY, name), moved);
        await knex('apk_versions').where({ id: version.id }).update({ stored_name: name });
      }
    }
  } catch (err) {
    undo(moved);
    throw err;
  }

  await knex.schema.alterTable('apk_versions', (table) => {
    table.dropUnique(['application_id', 'stored_name'], 'apk_versions_file_unique');
    table.unique(['stored_name'], { indexName: 'file_versions_stored_name_unique' });
  });
  await knex.schema.alterTable('applications', (table) => {
    table.dropColumn('storage_dir');
  });

  // Folders are left in place if anything besides empty apks/ and assets/
  // remains in them — assets have no home in the old layout.
  for (const application of applications) {
    const appRoot = path.join(STORAGE, application.storage_dir);
    for (const sub of ['apks', 'assets']) {
      try {
        fs.rmdirSync(path.join(appRoot, sub));
      } catch {
        /* not empty, or not there */
      }
    }
    try {
      fs.rmdirSync(appRoot);
    } catch {
      console.warn(`Left ${appRoot} in place: it still holds assets.`);
    }
  }
};
