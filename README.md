# Relay — APK distribution

A full-stack app for managing Android applications and handing their APK
versions to named users.

- **Backend** — Node.js (Express, ESM) + PostgreSQL, all queries through the Knex query builder
- **Frontend** — React 18 + Vite + React Router, mobile-first CSS, light/dark themes,
  English / French / Arabic with RTL
- **Auth** — JWT bearer tokens, bcrypt password hashes
- **Roles** — `admin` (manages everything) and `user` (downloads what they are given)

---

## Requirements

- Node.js 18 or newer
- PostgreSQL 12 or newer

## Setup

```bash
# 1. Database
createdb apk_manager

# 2. API
cd server
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npm install
npm run db:migrate            # runs the Knex migrations
npm run db:seed               # accounts + three demo applications
npm run dev                   # http://localhost:4000

# 3. Web app (second terminal)
cd client
npm install
npm run dev                   # http://localhost:5173
```

The Vite dev server proxies `/api` to port 4000, so the browser stays on one
origin. `npm run db:setup` migrates and seeds in one step; `npm run db:reset`
rolls everything back and rebuilds.

The seed prints the accounts it creates:

| Role   | Email               | Password    |
| ------ | ------------------- | ----------- |
| admin  | admin@example.com   | admin1234   |
| user   | amira@example.com   | tester1234  |
| user   | karim@example.com   | tester1234  |
| user   | lina@example.com    | tester1234  |

Change these before putting anything real in the system.

The demo data is built to show every state at once: **Field Service** has an
expired version, a live current version, and a switched-off beta restricted to
one person; **Warehouse Scanner** has an inactive old version and a live one
that expires in 45 days; **Reception Kiosk** is a deactivated application. The
`.apk` files are generated placeholders of a realistic size with real SHA-256
checksums — they download correctly but are not installable apps.

---

## Features

### Application management

An application is the product record: name, package name, description, icon,
status, who created it, and when it last changed. Each one holds many APK
versions.

```
Field Service          →  1.3.2, 1.4.0 (current), 1.5.0-beta
Warehouse Scanner      →  2.0.0, 2.0.1 (current)
```

Admins can add, edit, delete, activate, or deactivate an application. A
deactivated application disappears for users, and nothing inside it can be
downloaded, but its history is kept.

### Download status per version

Each version carries two facts an admin can change at any time:

| Field        | Meaning                                              |
| ------------ | ---------------------------------------------------- |
| `is_active`  | the Activate / Deactivate switch                     |
| `expires_at` | optional deadline; downloads stop at the end of that day |

The status shown in the interface is **derived from those two**, never stored
separately, so there is nothing to keep in sync:

| Shown      | When                                    |
| ---------- | --------------------------------------- |
| `Expired`  | `expires_at` is in the past             |
| `Inactive` | the switch is off                       |
| `Active`   | switch on, not expired                  |

Each version also carries a free-form **note**, separate from its release
description: a remark an admin leaves for whoever looks at the build later
("signed with the new release key", "rebuilt from the release branch"). The
**Note** button on a version opens a single text box; saving an empty box
removes the note. Anyone who can see the version can read it — only admins can
write it.

One version per application can also be marked **current** — the one offered by
the download button on the list. A user is offered the current version if they
can download it, otherwise the newest they can.

### Access

Access is granted on the application, and each version can narrow it:

- **Inherited** (the default) — the version uses the application's list.
- **Restricted** — the version has its own list, for a beta or a pilot group.

A non-admin can download a version only when all of this holds: the
application is active, the version is active, its expiry has not passed, and
they are on the version's own list if it has one, or the application's list if
it does not. Admins can always reach everything, including expired and
switched-off versions.

### People

Admins can add, edit, and remove accounts, switch someone between admin and
user, and **enable or disable sign-in with one button** on the people list. The
token is checked *and* the account reloaded on every request, so disabling
someone takes effect on their very next click rather than when their token
expires. The API refuses any change that would leave no active admin, and an
admin cannot disable, demote, or delete their own account.

---

## File storage

Every file the app distributes lives under `server/public/`, one folder per
application:

```
server/public/
  field-service/
    icon.svg
    apks/
      1.3.2.apk
      1.4.0.apk
      1.5.0-beta.apk
    assets/
      install-guide.txt
      release-notes.md
  warehouse-scanner/
    icon.svg
    apks/2.0.0.apk
    apks/2.0.1.apk
    assets/
```

**"Public" describes the files, not their URL.** These are the files meant for
distribution, but the folder is never served statically: there is no
`express.static` anywhere in the server, and any request outside `/api` —
including `/public/…` — is a 404. Every APK, icon, and asset is sent by a route
in `applications.routes.js`, after the same access check that governs the
application itself. The frontend shows and downloads them only through those
routes.

**Folders are created, renamed, and removed with the application**, so adding
an application needs no code or config change:

- The folder name is a slug of the application name: *Field Service* →
  `field-service`. Letters from any script survive, so an Arabic name keeps an
  Arabic folder name. Two applications with the same slug get `-2`, `-3`.
- The name is stored in `applications.storage_dir`; the database, not a
  recomputed slug, says where an application's files are.
- Renaming an application renames its folder. A change that keeps the same slug
  — fixing a capital letter — leaves it alone.
- Each version is stored as `apks/{version}.apk`, and changing the version
  number renames the file.
- Replacing the icon replaces `icon.*`, whatever the old extension was.
- Deleting an application deletes its folder.

**Assets** — screenshots, guides, anything else — go in `assets/`. The folder
itself is the index: there is no table, so whatever is in it is what the API
lists. Admins upload and delete from the application page; anyone who can see
the application can list and download. Accepted: images, PDF, text, Markdown,
JSON, CSV, ZIP, up to `MAX_ASSET_MB`.

**How files are kept inside their folders.** All path handling goes through
`src/lib/storage.js`. Every name is passed through one sanitiser
(`src/lib/slug.cjs`: no separators, no control characters, no leading dots, no
Windows-reserved names), and every final path is resolved and checked to still
be inside its folder before anything is read or written. The test suite sends
`..`, encoded `..%2F`, backslashes, an absolute path, and a null byte as raw
HTTP and confirms each is refused.

**Uploads are staged in `server/tmp/`** and only moved into `public/` once the
request has been validated, so a rejected upload never touches an application
folder.

**Moving from the old layout.** Earlier versions kept every file flat in
`uploads/` under a random name. The `application_storage_folders` migration
moves each one into place and updates the rows; files already missing are
listed rather than guessed at. If it fails part-way, it moves back what it
already moved. Rolling it back returns everything to the flat layout. Just run
`npm run db:migrate`.

| Variable          | Default     | Purpose                                     |
| ----------------- | ----------- | ------------------------------------------- |
| `STORAGE_DIR`     | `./public`  | the per-application folders                 |
| `UPLOAD_TMP_DIR`  | `./tmp`     | where uploads wait before they are moved    |
| `MAX_ASSET_MB`    | `50`        | largest asset                               |
| `UPLOAD_DIR`      | `./uploads` | read only by the migration, to find old files |

Relative paths resolve against `server/`, wherever the process is started from.

---

## Interface

Written mobile-first: the base stylesheet targets a phone and `min-width`
queries add tablet and desktop layout.

- **Navigation** — one set of markup throughout. On a phone, a top bar plus a
  bottom tab bar (with `safe-area-inset` padding); from 900px the two stack
  into a left sidebar. Nothing is hidden behind a hamburger.
- **Tables** — each row is a self-contained card on a phone, with every cell
  labelled through `data-label`. From 760px the same markup becomes a CSS grid
  with a header row that fills 100% of the content width, up to a 1440px
  reading limit.
- **Modals** — bottom sheets on a phone, centred dialogs from 600px.
- **Downloads** — the button shows a spinner the moment it is clicked and is
  disabled until the file is in hand, so it cannot be started twice. The
  response is read as a stream and the percentage is counted from
  `Content-Length`: 0% up to 100%, each number reported once. A file that
  arrives in a single chunk goes straight from 0% to 100% rather than flashing
  an intermediate number. If the length is missing — a chunked or re-encoding
  proxy in front of the API — the button keeps the spinner and shows no number
  rather than inventing one. Nothing about the API changed; the same request is
  read differently.
- **Touch** — 44px targets, 15px inputs so iOS does not zoom on focus.
- **Dark mode** — a switch in the top bar, plus Light / Dark / *Match my
  device* on the account page. The choice is stored in `localStorage`, applied
  to `<html>` before first paint so a dark session never flashes white, and
  follows the OS live while set to *Match my device*. Colours are declared once
  as tokens and redefined for the dark theme; no component names a colour.
- Status is never carried by colour alone — every chip and switch is labelled.
  `prefers-reduced-motion` turns off all animation.

### Languages

English, French, and Arabic, switchable from the top bar and from the account
page. The choice is stored in `localStorage`; with nothing stored, the browser's
own language preference decides.

All client text lives in `src/data/`, one folder per language:

```
src/data/
  data_en/   common.json  auth.json  apps.json  people.json  account.json  index.js
  data_fr/   … same files
  data_ar/   … same files
```

Each `index.js` names the language and exports its files:

```js
export default { code: 'ar', label: 'العربية', dir: 'rtl', intl: 'ar-TN', common, auth, apps, ... };
```

- `src/lib/i18n.jsx` holds the provider. `t('apps.detail.settings')` reads a
  dotted key; `t('apps.toast.created', { name })` fills `{name}` placeholders.
- A key the active language is missing falls back to English, then to the key
  itself, so an unfinished translation is visible rather than blank.
- Plurals go through `Intl.PluralRules`, so each language uses the forms it
  actually has: `_one` / `_other` for English and French, and
  `_one` / `_two` / `_few` / `_many` / `_other` for Arabic — "3 أيام" for three
  days but "20 يومًا" for twenty.
- Dates, relative times, and file sizes are formatted with `Intl` in the active
  locale, so French shows "8,3 MB" and Arabic reads dates right to left.
- Choosing Arabic sets `dir="rtl"` on `<html>` before first paint. The layout is
  written with flexbox and grid, so it mirrors on its own; a short `[dir='rtl']`
  block at the end of `styles.css` handles the few asymmetric details (the back
  arrow, the select caret, the switch knob, the nav marker). Version numbers,
  package names, checksums, and emails are wrapped as LTR so their digits and
  dots do not reorder inside Arabic text.

Adding a language: copy a `data_xx` folder, translate the JSON, and add it to
`LOCALES` in `src/lib/i18n.jsx`. Nothing else changes.

Server error messages are still English — they are generated API-side, so
translating them would mean sending message codes instead of sentences.

---

## Project structure

```
server/
  knexfile.cjs               development / test / production connections
  migrations/                one file per change, applied in order
  seeds/
    01_users.cjs             accounts (upsert on email)
    02_applications.cjs      demo apps, icons, versions, grants
  src/
    index.js  app.js  db.js
    lib/       config.js  http.js  serialize.js  params.js
               storage.js           every path under public/ goes through here
               slug.cjs             folder and file naming, shared with migrations
    middleware/auth.js  upload.js
    routes/    auth.routes.js  users.routes.js  applications.routes.js
  public/                    one folder per application, never served statically
  tmp/                       uploads waiting to be validated

client/
  src/
    main.jsx  App.jsx  styles.css
    data/      data_en/  data_fr/  data_ar/   all client-side text
    lib/       api.js  auth.jsx  theme.jsx  i18n.jsx  format.js
    components/
      Layout.jsx             top bar + tabs / sidebar
      ui.jsx                 Modal, Switch, Status, icons, toasts, theme toggle
      UserPicker.jsx         searchable access checklist
      AppFormModal.jsx       create / edit an application, with its icon
      VersionModal.jsx       upload or edit a version, with status and expiry
      NoteModal.jsx          the note on a version
      AssetsCard.jsx         the application's assets/ folder
      DownloadButton.jsx     download with progress, disabled while running
    pages/
      Login.jsx  ApplicationsPage.jsx  ApplicationDetailPage.jsx
      UsersPage.jsx  AccountPage.jsx
```

---

## Data model

```
users ──┬── applications.created_by
        ├── application_access.user_id      default access, per application
        ├── version_access.user_id          optional override, per version
        └── apk_versions.uploaded_by

applications ──┬── apk_versions             one app, many versions
               └── application_access

apk_versions ──┬── version_access
               └── downloads                one row per download
```

- `UNIQUE (application_id, version)` stops duplicate version numbers.
- A partial unique index, `UNIQUE (application_id) WHERE is_current`, means the
  database guarantees at most one current version per application.
- Both grant tables use composite primary keys, so nobody can be added twice.
- Every foreign key has an explicit `ON DELETE` rule: deleting an application
  removes its versions and grants, deleting a user removes their grants, and an
  uploader who leaves becomes `NULL` rather than taking the history with them.

## Migrations and seeds

Schema changes go through [Knex](https://knexjs.org). The migration and seed
files are `.cjs` because the Knex CLI loads them directly while the server runs
as ESM. `src/db.js` builds one Knex instance from the same knexfile, and every
query in the routes uses the query builder — see the note below.

```bash
npm run db:migrate            # apply anything pending
npm run db:rollback           # undo the last batch
npm run db:status             # applied vs pending
npm run db:seed               # re-run the seeds (safe to repeat)
npm run db:setup              # migrate + seed
npm run db:reset              # roll everything back, then migrate + seed
npm run make:migration add_release_channel
npm run make:seed 03_something
```

Anything else the CLI supports is available through `npm run knex -- <command>`.

| Migration                        | Adds                                                  |
| -------------------------------- | ----------------------------------------------------- |
| `..._create_users`               | accounts, role check, `lower(email)` index            |
| `..._create_files`               | the original file record                              |
| `..._create_file_versions`       | binaries, unique version per file, one-current index  |
| `..._create_file_access`         | the grant table                                       |
| `..._create_downloads`           | the download log                                      |
| `..._rename_to_applications`     | files → applications, versions → apk_versions, and the index and constraint names with them |
| `..._version_download_status`    | `is_active` + `expires_at`, drops the old `status`    |
| `..._application_status_values`  | applications are active/inactive, not archived        |
| `..._application_icons`          | icon columns                                          |
| `..._create_version_access`      | per-version access overrides                          |
| `..._add_version_note`           | the free-form `note` on a version                     |
| `..._application_storage_folders`| `storage_dir`, per-app file uniqueness, and moves files from `uploads/` into `public/{app}/` |

Both seeds are safe to run repeatedly. `01_users` upserts on email, so it
resets the demo passwords without touching accounts created in the app.
`02_applications` replaces all applications — rows and folders under
`public/` together — so re-seeding reproduces exactly the same tree every time.
Only run it where losing the existing applications is fine.

For production, set `NODE_ENV=production` and run `npm run db:migrate` as part
of the deploy; the `production` block in `knexfile.cjs` enables TLS and a
larger pool.

---

## API

All routes are under `/api`. Everything except `POST /auth/login` needs
`Authorization: Bearer <token>`.

### Auth

| Method | Path                 | Who   | Purpose                   |
| ------ | -------------------- | ----- | ------------------------- |
| POST   | `/auth/login`        | any   | returns `{ token, user }` |
| GET    | `/auth/me`           | auth  | the signed-in user        |
| PUT    | `/auth/me/password`  | auth  | change your own password  |

### Users

| Method | Path                 | Who   | Purpose                                |
| ------ | -------------------- | ----- | -------------------------------------- |
| GET    | `/users`             | admin | list, `?search=`                       |
| POST   | `/users`             | admin | create                                 |
| PUT    | `/users/:id`         | admin | name, email, role, password, sign-in   |
| PATCH  | `/users/:id/active`  | admin | the enable / disable switch            |
| DELETE | `/users/:id`         | admin | delete                                 |

### Applications

| Method | Path                            | Who   | Purpose                              |
| ------ | ------------------------------- | ----- | ------------------------------------ |
| GET    | `/applications`                 | auth  | role-filtered list, `?search=&status=` |
| GET    | `/applications/:id`             | auth  | details, versions, access list       |
| GET    | `/applications/:id/icon`        | auth  | the icon (accepts `?token=` for `<img>`) |
| POST   | `/applications`                 | admin | create (multipart, optional `icon`)  |
| PUT    | `/applications/:id`             | admin | edit (multipart, `icon`, `removeIcon`) |
| PATCH  | `/applications/:id/status`      | admin | activate / deactivate                |
| DELETE | `/applications/:id`             | admin | delete, with its versions and files  |
| PUT    | `/applications/:id/access`      | admin | replace the application access list  |
| GET    | `/applications/:id/assets`      | auth  | list the files in `assets/`          |
| GET    | `/applications/:id/assets/:name`| auth  | download one                         |
| POST   | `/applications/:id/assets`      | admin | upload (multipart `file`)            |
| DELETE | `/applications/:id/assets/:name`| admin | delete one                           |

### APK versions

| Method | Path                                                | Who   | Purpose                        |
| ------ | --------------------------------------------------- | ----- | ------------------------------ |
| POST   | `/applications/:id/versions`                        | admin | upload (multipart `file`)      |
| PUT    | `/applications/:id/versions/:vid`                   | admin | version, description, switch, expiry |
| PUT    | `/applications/:id/versions/:vid/note`              | admin | add, edit, or clear the note   |
| PATCH  | `/applications/:id/versions/:vid/active`            | admin | the activate / deactivate button |
| PUT    | `/applications/:id/versions/:vid/access`            | admin | `{ inherit: true }` or `{ userIds }` |
| POST   | `/applications/:id/versions/:vid/current`           | admin | mark as current                |
| DELETE | `/applications/:id/versions/:vid`                   | admin | delete one version             |
| GET    | `/applications/:id/download`                        | auth  | the version on offer now       |
| GET    | `/applications/:id/versions/:vid/download`          | auth  | a specific version             |

Multipart fields for a version: `file`, `version`, `description`, `isActive`,
`expiresAt` (`YYYY-MM-DD` or empty), `makeCurrent`, and `userIds` to restrict
that version on upload.

Errors come back as `{ "error": "A sentence you can show the user." }` with a
matching status: 400 invalid input, 401 not signed in, 403 no access, 404
missing or unavailable, 409 duplicate, 413 file too large.

---

## Queries

There is no raw SQL in `server/src`: no `db.raw`, no `whereRaw`, no hand-written
statements. Every read and write goes through the Knex query builder, which also
means every value is parameterised by construction.

Two builder features carry the parts that used to be raw:

- `db.ref('a.id')` makes a correlated subquery refer to the outer row, so the
  counts on the applications list (`version_count`, `user_count`,
  `downloadable_count`) are `select({ … })` subqueries rather than SQL strings.
- Knex modifiers keep the access rule in one place. `downloadableBy(userId)`
  builds the whole condition — switch on, not expired, and on the version's own
  list or the application's — with nested `where` callbacks, `whereExists`, and
  `whereNotExists`. Any query that needs it calls
  `.modify(downloadableBy(req.user.id))`.

Two things changed shape as a result:

- The user list for a non-admin was a `LEFT JOIN LATERAL`, which the builder has
  no expression for. It is now one query for the versions they may download,
  grouped into applications in JavaScript — clearer, and one query rather than a
  correlated subquery per row.
- Per-version access lists were a `json_agg`. They are now a second query joined
  in memory.

Logins match on a lowercased `email` rather than `lower(email)`, since every
write stores the address lowercased; the expression index from the first
migration is left in place and simply unused.

## Security notes

- Passwords are bcrypt hashes (cost 10) and `password_hash` never leaves the
  server — every response goes through `lib/serialize.js`.
- The token is verified **and** the account reloaded on every request, so a
  demotion or a disabled account takes effect at once.
- `public/` is not served statically; nothing outside `/api` is. Every APK,
  icon, and asset request runs the access check first, and APK downloads are
  recorded in `downloads`.
- File responses carry `X-Content-Type-Options: nosniff` and a
  `default-src 'none'; sandbox` CSP, so an SVG or text file opened directly
  cannot run anything.
- File and folder names are sanitised and every resolved path is checked to
  stay inside its folder — see *File storage*.
- A refused version download returns the same 404 whether it is switched off,
  expired, or simply not granted, so the response does not leak which.
- Uploads are limited by `MAX_UPLOAD_MB` / `MAX_ICON_MB` and restricted by
  extension (`.apk`; PNG, JPEG, WebP, SVG for icons). A failed insert deletes
  the orphaned upload.
- Stored filenames are random, so a guessed URL cannot reach a binary.
- CORS is restricted to the origins in `CORS_ORIGIN`.
- Login failures return one message for both a wrong email and a wrong
  password.

## Worth changing before production

- `.apk` is enforced by extension only. Checking the ZIP magic bytes and
  parsing `AndroidManifest.xml` would confirm the file really is an APK and let
  you read the true `versionCode` instead of trusting what was typed.
- Icons are served through the API on every request. Put a cache or a CDN in
  front, or move them to object storage with signed URLs.
- Files sit on the local disk. Point `STORAGE_DIR` at a mounted volume and back
  it up with the database — a row without its file, or the reverse, is the one
  inconsistency the app cannot repair on its own. For S3-compatible storage,
  `src/lib/storage.js` is the only module to replace.
- The icon URL carries the token as a query parameter so `<img>` can load it;
  that value can appear in server logs. A short-lived signed URL would be
  tighter.
- Tokens live in `localStorage`. An httpOnly refresh cookie is stronger.
- Add rate limiting on `POST /auth/login` (for example `express-rate-limit`).
- Expiry is evaluated against the server clock in UTC, with a date-only input
  treated as the end of that day in the server's timezone. If you have users
  across timezones, store the intended zone alongside the date.
