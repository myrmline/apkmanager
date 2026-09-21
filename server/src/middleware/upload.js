import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../lib/config.js';
import { badRequest } from '../lib/http.js';

/**
 * Uploads land in tmp/ under a random name. A route validates the request,
 * then moves the file into the application's folder under public/ — so a
 * rejected upload never touches public/ at all.
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.tmpDir),
  filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`),
});

/**
 * Browsers send the filename as raw UTF-8 bytes, which multer decodes as
 * latin1. Re-decode it, so "لقطة شاشة.png" arrives intact.
 */
function fixName(file) {
  const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
  if (!decoded.includes('\uFFFD')) file.originalname = decoded;
}

const accept = (extensions, message) => (_req, file, cb) => {
  fixName(file);
  const ext = path.extname(file.originalname).toLowerCase();
  if (!extensions.includes(ext)) return cb(badRequest(message));
  cb(null, true);
};

export const uploadApk = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: accept(['.apk'], 'Only .apk files can be uploaded.'),
}).single('file');

const ICON_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export const uploadIcon = multer({
  storage,
  limits: { fileSize: config.maxIconBytes, files: 1 },
  fileFilter: accept(Object.keys(ICON_TYPES), 'Use a PNG, JPEG, WebP, or SVG image.'),
}).single('icon');

/** What an application folder may hold besides its APKs and icon. */
export const ASSET_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json',
  '.csv': 'text/csv; charset=utf-8',
  '.zip': 'application/zip',
};

export const uploadAsset = multer({
  storage,
  limits: { fileSize: config.maxAssetBytes, files: 1 },
  fileFilter: accept(
    Object.keys(ASSET_TYPES),
    'Use an image, PDF, text, Markdown, JSON, CSV, or ZIP file.',
  ),
}).single('file');

export const mimeFor = (name, table = { ...ICON_TYPES, ...ASSET_TYPES }) =>
  table[path.extname(name).toLowerCase()] || 'application/octet-stream';

/** SHA-256 of a file, shown on the version so a build can be verified. */
export function checksumOf(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

/** Drop an upload still sitting in tmp/ — the request failed before it moved. */
export function discardTemp(file) {
  if (file?.path) fs.promises.rm(file.path, { force: true }).catch(() => {});
}
