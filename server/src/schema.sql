-- ---------------------------------------------------------------------------
-- APK Manager schema
--
--   users ──┬── files (created_by)
--           ├── file_access (user_id)      many-to-many: who may download what
--           └── file_versions (uploaded_by)
--
--   files ──┬── file_versions   one file, many versions, exactly one current
--           └── file_access
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

-- A "file" is the logical app record. The binaries live in file_versions.
CREATE TABLE IF NOT EXISTS files (
  id           SERIAL PRIMARY KEY,
  name         TEXT        NOT NULL,
  package_name TEXT,
  description  TEXT,
  status       TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by   INTEGER     REFERENCES users (id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS files_status_idx ON files (status);

CREATE TABLE IF NOT EXISTS file_versions (
  id            SERIAL PRIMARY KEY,
  file_id       INTEGER     NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  version       TEXT        NOT NULL,
  notes         TEXT,
  -- draft     = uploaded but held back, admins only
  -- published = downloadable by authorised users
  -- archived  = kept for history, no longer offered
  status        TEXT        NOT NULL DEFAULT 'published'
                            CHECK (status IN ('draft', 'published', 'archived')),
  is_current    BOOLEAN     NOT NULL DEFAULT FALSE,
  original_name TEXT        NOT NULL,
  stored_name   TEXT        NOT NULL UNIQUE,
  size_bytes    BIGINT      NOT NULL,
  checksum      TEXT,
  uploaded_by   INTEGER     REFERENCES users (id) ON DELETE SET NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, version)
);

CREATE INDEX IF NOT EXISTS file_versions_file_idx ON file_versions (file_id, uploaded_at DESC);

-- At most one current version per file.
CREATE UNIQUE INDEX IF NOT EXISTS file_versions_one_current_idx
  ON file_versions (file_id) WHERE is_current;

CREATE TABLE IF NOT EXISTS file_access (
  file_id    INTEGER     NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  user_id    INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  granted_by INTEGER     REFERENCES users (id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, user_id)
);

CREATE INDEX IF NOT EXISTS file_access_user_idx ON file_access (user_id);

-- Every download is recorded, so an admin can see who actually took a build.
CREATE TABLE IF NOT EXISTS downloads (
  id          SERIAL PRIMARY KEY,
  version_id  INTEGER     NOT NULL REFERENCES file_versions (id) ON DELETE CASCADE,
  user_id     INTEGER     REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS downloads_version_idx ON downloads (version_id);
