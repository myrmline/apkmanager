import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const required = (key, fallback) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable ${key}. Copy .env.example to .env.`);
  }
  return value;
};

// Relative paths resolve against the server folder, not wherever the process
// happened to start, so the API, the migrations, and the seeds agree.
const serverRoot = fileURLToPath(new URL('../..', import.meta.url));
const fromRoot = (value, fallback) => path.resolve(serverRoot, value || fallback);

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',

  // One folder per application: public/{app}/icon.*, apks/, assets/.
  // Never served statically — every file goes through an authorised route.
  storageDir: fromRoot(process.env.STORAGE_DIR, 'public'),
  // Uploads land here first, and move into the app folder once validated.
  tmpDir: fromRoot(process.env.UPLOAD_TMP_DIR, 'tmp'),

  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 300) * 1024 * 1024,
  maxIconBytes: Number(process.env.MAX_ICON_MB || 2) * 1024 * 1024,
  maxAssetBytes: Number(process.env.MAX_ASSET_MB || 50) * 1024 * 1024,

  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'admin1234',
  },
};
