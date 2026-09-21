import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../lib/config.js';
import { badRequest } from '../lib/http.js';

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

export const uploadApk = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const isApk = path.extname(file.originalname).toLowerCase() === '.apk';
    if (!isApk) return cb(badRequest('Only .apk files can be uploaded.'));
    cb(null, true);
  },
}).single('file');

const ICON_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/** Optional `icon` field on the application create and update forms. */
export const uploadIcon = multer({
  storage,
  limits: { fileSize: config.maxIconBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ICON_TYPES[ext]) return cb(badRequest('Use a PNG, JPEG, WebP, or SVG image.'));
    cb(null, true);
  },
}).single('icon');

export const iconMime = (originalName) =>
  ICON_TYPES[path.extname(originalName).toLowerCase()] || 'application/octet-stream';

/** SHA-256 of a stored upload, shown on the version so a build can be verified. */
export function checksumOf(storedName) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(path.join(config.uploadDir, storedName))
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

export function removeUpload(storedName) {
  if (!storedName) return;
  fs.promises.unlink(path.join(config.uploadDir, storedName)).catch(() => {});
}

export const uploadPath = (storedName) => path.join(config.uploadDir, storedName);
