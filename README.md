# Relay — APK distribution

A small full-stack app for handing Android builds to named testers.

- **Backend** — Node.js (Express, ESM) + PostgreSQL
- **Frontend** — React 18 + Vite + React Router
- **Auth** — JWT bearer tokens, bcrypt password hashes
- **Roles** — `admin` (manages everything) and `user` (downloads what they are assigned)

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
npm run db:migrate            # creates the tables
npm run db:seed               # creates one admin and three testers
npm run dev                   # http://localhost:4000

# 3. Web app (second terminal)
cd client
npm install
npm run dev                   # http://localhost:5173
```

The Vite dev server proxies `/api` to port 4000, so the browser stays on one
origin. `npm run db:reset` drops the tables and re-seeds from scratch.

The seed script prints the accounts it creates, for example:

| Role   | Email               | Password    |
| ------ | ------------------- | ----------- |
| admin  | admin@example.com   | admin1234   |
| user   | amira@example.com   | tester1234  |
| user   | karim@example.com   | tester1234  |
| user   | lina@example.com    | tester1234  |

Change these before putting anything real in the system.

---

## Project structure

```
server/
  src/
    index.js               starts the HTTP server
    app.js                 express app, CORS, routers, error handler
    db.js                  pg pool, query(), transaction()
    schema.sql             every table, index, and constraint
    lib/
      config.js            environment variables in one place
      http.js              HttpError + asyncHandler + error middleware
      serialize.js         row -> JSON (never leaks password_hash)
    middleware/
      auth.js              requireAuth, requireAdmin, signToken
      upload.js            multer disk storage, .apk filter, SHA-256
    routes/
      auth.routes.js       login, me, change own password
      users.routes.js      user CRUD (admin only)
      files.routes.js      files, versions, access, downloads
    scripts/
      migrate.js           applies schema.sql (--drop to start over)
      seed.js              creates the first admin and sample testers
  uploads/                 stored APKs, never served statically

client/
  src/
    main.jsx               providers and router
    App.jsx                routes and the admin-only guard
    styles.css             design tokens and every component style
    lib/
      api.js               fetch wrapper, XHR upload, authorised download
      auth.jsx             AuthProvider / useAuth
      format.js            file sizes and dates
    components/
      Layout.jsx           side rail and navigation
      ui.jsx               Modal, ConfirmDialog, Field, Status, toasts
      UserPicker.jsx       searchable "who can download this" checklist
      UploadModal.jsx      new build + first version + access list
      NewVersionModal.jsx  new version of an existing build
    pages/
      Login.jsx  FilesPage.jsx  FileDetailPage.jsx
      UsersPage.jsx  AccountPage.jsx
```

---

## Data model

```
users ──┬── files.created_by
        ├── file_access.user_id        many-to-many: who may download what
        └── file_versions.uploaded_by

files ──┬── file_versions              one file, many versions
        └── file_access

file_versions ── downloads             one row per download
```

- `files` is the logical app record: name, package name, description, status
  (`active` / `archived`).
- `file_versions` holds the binaries: version string, release notes, status
  (`draft` / `published` / `archived`), `is_current`, original filename, stored
  filename, size, SHA-256 checksum, uploader, timestamp.
- `UNIQUE (file_id, version)` stops duplicate version numbers.
- A partial unique index, `UNIQUE (file_id) WHERE is_current`, means the
  database itself guarantees at most one current version per file.
- `file_access` is the grant table with a composite primary key, so a user
  cannot be added twice to the same file.
- Every foreign key has an explicit `ON DELETE` rule: deleting a file removes
  its versions and grants, deleting a user removes their grants, and an
  uploader who leaves becomes `NULL` rather than taking the history with them.

### How access is decided

| Who    | Sees                                                        |
| ------ | ----------------------------------------------------------- |
| admin  | every file and every version, including drafts               |
| user   | `active` files granted to them, `published` versions only    |

Access is granted per file and inherited by its versions. To hold a single
build back from testers while keeping it downloadable by admins, upload it as
a draft (or press **Hold back** on the version). Changing the access list
takes effect immediately, for every version.

---

## API

All routes are under `/api`. Everything except `POST /auth/login` needs
`Authorization: Bearer <token>`.

### Auth

| Method | Path                 | Who   | Purpose                     |
| ------ | -------------------- | ----- | --------------------------- |
| POST   | `/auth/login`        | any   | returns `{ token, user }`   |
| GET    | `/auth/me`           | auth  | the signed-in user          |
| PUT    | `/auth/me/password`  | auth  | change your own password    |

### Users

| Method | Path          | Who   | Purpose                                  |
| ------ | ------------- | ----- | ---------------------------------------- |
| GET    | `/users`      | admin | list, `?search=`                         |
| POST   | `/users`      | admin | create                                   |
| PUT    | `/users/:id`  | admin | update name, email, role, password, active |
| DELETE | `/users/:id`  | admin | delete                                   |

### Files and versions

| Method | Path                                        | Who   | Purpose                        |
| ------ | ------------------------------------------- | ----- | ------------------------------ |
| GET    | `/files`                                    | auth  | role-filtered list             |
| GET    | `/files/:id`                                | auth  | details, versions, access list |
| POST   | `/files`                                    | admin | upload a build (multipart)     |
| PUT    | `/files/:id`                                | admin | edit name, package, description, status |
| DELETE | `/files/:id`                                | admin | delete the file and its APKs   |
| PUT    | `/files/:id/access`                         | admin | replace the allowed-user list  |
| POST   | `/files/:id/versions`                       | admin | upload a new version (multipart) |
| PUT    | `/files/:id/versions/:vid`                  | admin | edit version, notes, status    |
| POST   | `/files/:id/versions/:vid/current`          | admin | mark as the current version    |
| DELETE | `/files/:id/versions/:vid`                  | admin | delete one version             |
| GET    | `/files/:id/download`                       | auth  | download the current version   |
| GET    | `/files/:id/versions/:vid/download`         | auth  | download a specific version    |

Multipart fields for an upload: `file` (the .apk), `name`, `version`,
`packageName`, `description`, `notes`, `versionStatus` (`published` |
`draft`), `userIds` (JSON array), and for a new version `makeCurrent`.

Errors come back as `{ "error": "A sentence you can show the user." }` with a
matching status code: 400 invalid input, 401 not signed in, 403 no access,
404 missing, 409 duplicate, 413 file too large.

---

## Security notes

- Passwords are bcrypt hashes (cost 10) and `password_hash` never leaves the
  server — every response goes through `lib/serialize.js`.
- The token is verified **and** the user is reloaded from the database on every
  request, so a demotion or deactivation takes effect at once instead of at
  token expiry.
- `uploads/` is not served as static files. Every download runs the access
  check first and is recorded in `downloads`.
- Uploads are limited by `MAX_UPLOAD_MB` and rejected unless the filename ends
  in `.apk`. If the database insert fails, the orphaned upload is deleted.
- Stored filenames are random, so a guessed URL cannot reach a binary and two
  builds with the same name cannot overwrite each other.
- CORS is restricted to the origins in `CORS_ORIGIN`.
- The API refuses to leave the system without an active admin, and an admin
  cannot demote, deactivate, or delete their own account.
- Login failures return one message for both a wrong email and a wrong
  password, so the response does not reveal which accounts exist.

## Worth changing before production

- `.apk` is enforced by extension only. Checking the ZIP magic bytes and
  parsing `AndroidManifest.xml` would confirm the file really is an APK and let
  you read the true `versionCode` instead of trusting what the admin typed.
- Binaries sit on the local disk. Point `UPLOAD_DIR` at a mounted volume, or
  swap `middleware/upload.js` for S3-compatible storage with signed URLs.
- Tokens live in `localStorage`, which is convenient but readable by any script
  on the page. An httpOnly refresh cookie is the stronger option.
- Add rate limiting on `POST /auth/login` (for example `express-rate-limit`).
- Access is granted per file. If you need per-version grants instead, add a
  `version_access` table and check it in `assertCanRead`.
