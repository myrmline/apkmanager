const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { slugify, safeFileName } = require('../src/lib/slug.cjs');

require('dotenv').config();

const storageRoot = path.resolve(__dirname, '..', process.env.STORAGE_DIR || 'public');

/**
 * Demo applications, written in the same layout the API uses:
 *
 *   public/field-service/icon.svg
 *   public/field-service/apks/1.4.0.apk
 *   public/field-service/assets/release-notes.md
 *
 * The .apk files are placeholders, not installable apps — they exist so
 * downloads, sizes, and checksums behave like the real thing.
 *
 * Like the rows, the folders are replaced on every run: this seed removes every
 * application, so it removes every application folder with it.
 */
const applications = [
  {
    name: 'Field Service',
    packageName: 'com.relay.fieldservice',
    description: 'Job list and proof-of-visit capture for engineers on the road.',
    status: 'active',
    icon: { tint: '#0e7c86', glyph: 'FS' },
    assets: {
      'release-notes.md': '# Field Service\n\n## 1.4.0\n\n- Route planning\n- Background photo upload\n',
      'install-guide.txt': 'Uninstall any 1.3.x build before installing 1.4.0: the signing key changed.\n',
    },
    allow: ['amira@example.com', 'karim@example.com'],
    versions: [
      {
        version: '1.3.2',
        description: 'Offline job cache. Fixes the signature pad on tablets.',
        sizeKb: 8200,
        daysAgo: 34,
        isActive: true,
        expiresInDays: -3, // already past: shows as Expired
      },
      {
        version: '1.4.0',
        description: 'Route planning, and photos now upload in the background.',
        note: 'Signed with the new release key. Testers on 1.3.x must uninstall first.',
        sizeKb: 8640,
        daysAgo: 6,
        isActive: true,
        current: true,
        expiresInDays: 60,
      },
      {
        version: '1.5.0-beta',
        description: 'New scheduling screen. Only the two people on the beta.',
        sizeKb: 9100,
        daysAgo: 1,
        isActive: false, // shows as Inactive until QA signs off
        restrictTo: ['karim@example.com'],
      },
    ],
  },
  {
    name: 'Warehouse Scanner',
    packageName: 'com.relay.scanner',
    description: 'Barcode picking and stock counts for handheld devices.',
    status: 'active',
    icon: { tint: '#6b4fa8', glyph: 'WS' },
    allow: ['lina@example.com', 'amira@example.com'],
    versions: [
      {
        version: '2.0.0',
        description: 'First release on the new scanning library.',
        sizeKb: 5400,
        daysAgo: 58,
        isActive: false,
      },
      {
        version: '2.0.1',
        description: 'Fixes a crash when a scan is cancelled mid-count.',
        sizeKb: 5460,
        daysAgo: 12,
        isActive: true,
        current: true,
        expiresInDays: 45,
      },
    ],
  },
  {
    name: 'Reception Kiosk',
    packageName: 'com.relay.kiosk',
    description: 'Visitor sign-in for the front desk. Replaced by the web app.',
    status: 'inactive',
    icon: { tint: '#8a6516', glyph: 'RK' },
    allow: ['karim@example.com'],
    versions: [
      {
        version: '1.0.0',
        description: 'Final release before the kiosk was retired.',
        sizeKb: 3100,
        daysAgo: 220,
        isActive: true,
        current: true,
      },
    ],
  },
];

/** A flat-colour SVG tile, so every application has an icon without binaries. */
function writeIcon(dir, { tint, glyph }) {
  const storedName = 'icon.svg';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <rect width="96" height="96" rx="22" fill="${tint}"/>
  <text x="48" y="60" text-anchor="middle" font-family="system-ui, sans-serif"
        font-size="34" font-weight="600" fill="#ffffff">${glyph}</text>
</svg>`;
  fs.writeFileSync(path.join(dir, storedName), svg, 'utf8');
  return { storedName, originalName: `${glyph.toLowerCase()}-icon.svg`, mime: 'image/svg+xml' };
}

/** A file of roughly the right size that starts with the ZIP magic bytes. */
function writePlaceholderApk(dir, label, version, sizeKb) {
  const storedName = `${safeFileName(version, 'version')}.apk`;
  const header = Buffer.from('PK\u0003\u0004');
  const body = Buffer.alloc(sizeKb * 1024 - header.length, 0x20);
  body.write(`placeholder build ${label} — not an installable APK`);
  const contents = Buffer.concat([header, body]);

  fs.writeFileSync(path.join(dir, 'apks', storedName), contents);
  return {
    storedName,
    size: contents.length,
    checksum: crypto.createHash('sha256').update(contents).digest('hex'),
  };
}

const shiftDays = (days) => new Date(Date.now() + days * 86400000);

exports.seed = async (knex) => {
  fs.mkdirSync(storageRoot, { recursive: true });

  // Clear everything: rows (versions and grants follow by ON DELETE CASCADE)
  // and every application folder, including any left behind by a rollback.
  await knex('applications').del();
  fs.readdirSync(storageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .forEach((entry) => fs.rmSync(path.join(storageRoot, entry.name), { recursive: true, force: true }));

  const admin = await knex('users').where({ role: 'admin' }).orderBy('id').first();
  if (!admin) throw new Error('Run the users seed first: there is no admin to own these apps.');

  const people = await knex('users').select('id', 'email');
  const idFor = (email) => people.find((user) => user.email === email)?.id;

  for (const app of applications) {
    const storageDir = slugify(app.name);
    const dir = path.join(storageRoot, storageDir);
    fs.mkdirSync(path.join(dir, 'apks'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });

    const icon = writeIcon(dir, app.icon);
    Object.entries(app.assets || {}).forEach(([name, text]) =>
      fs.writeFileSync(path.join(dir, 'assets', name), text, 'utf8'),
    );
    const newest = Math.min(...app.versions.map((version) => version.daysAgo));
    const oldest = Math.max(...app.versions.map((version) => version.daysAgo));

    const [row] = await knex('applications')
      .insert({
        name: app.name,
        package_name: app.packageName,
        description: app.description,
        status: app.status,
        storage_dir: storageDir,
        icon_stored_name: icon.storedName,
        icon_original_name: icon.originalName,
        icon_mime: icon.mime,
        created_by: admin.id,
        created_at: shiftDays(-(oldest + 30)),
        updated_at: shiftDays(-newest),
      })
      .returning('*');

    for (const version of app.versions) {
      const apk = writePlaceholderApk(
        dir,
        `${app.packageName.split('.').pop()}-${version.version}`,
        version.version,
        version.sizeKb,
      );

      const [created] = await knex('apk_versions')
        .insert({
          application_id: row.id,
          version: version.version,
          description: version.description,
          note: version.note || null,
          is_active: version.isActive,
          is_current: Boolean(version.current),
          expires_at: version.expiresInDays ? shiftDays(version.expiresInDays) : null,
          original_name: `${app.packageName}-${version.version}.apk`,
          stored_name: apk.storedName,
          size_bytes: apk.size,
          checksum: apk.checksum,
          uploaded_by: admin.id,
          uploaded_at: shiftDays(-version.daysAgo),
        })
        .returning('*');

      // A version with rows here is narrowed to exactly those people.
      if (version.restrictTo?.length) {
        await knex('version_access').insert(
          version.restrictTo.map((email) => ({
            version_id: created.id,
            user_id: idFor(email),
            granted_by: admin.id,
          })),
        );
      }
    }

    const grants = app.allow
      .map(idFor)
      .filter(Boolean)
      .map((userId) => ({ application_id: row.id, user_id: userId, granted_by: admin.id }));

    if (grants.length) await knex('application_access').insert(grants);

    console.log(
      `  public/${storageDir.padEnd(18)} ${app.versions.length} version(s), ` +
        `${grants.length} user(s)${app.status === 'inactive' ? ', inactive' : ''}`,
    );
  }

  console.log('\nDemo applications ready. The .apk files are placeholders, not installable apps.');
};
