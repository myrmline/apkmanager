import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { notFound } from './http.js';
import naming from './slug.cjs';

/**
 * Everything under public/ is read and written through this module.
 *
 *   public/
 *     {application}/          one folder per application, named from its name
 *       icon.png              the icon, whatever its extension
 *       apks/1.4.0.apk        one file per version
 *       assets/…              anything else: screenshots, guides, notes
 *
 * The database stores only the folder name (applications.storage_dir) and each
 * file's name within it, so moving the whole tree is a config change, and
 * renaming an application is one folder rename.
 */

export const { slugify, safeFileName } = naming;

export const APK_DIR = 'apks';
export const ASSET_DIR = 'assets';

const root = config.storageDir;
fs.mkdirSync(root, { recursive: true });
fs.mkdirSync(config.tmpDir, { recursive: true });

/**
 * Resolve a path under `base`, and refuse anything that would land outside it.
 * Every name that reaches the disk passes through here, so a crafted asset name
 * or a tampered database row cannot read or write beyond its own folder.
 */
export function inside(base, ...parts) {
  const target = path.resolve(base, ...parts);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw notFound('That file is not available.');
  }
  return target;
}

export const appDir = (application) => inside(root, application.storage_dir);

export const apkPath = (application, storedName) =>
  inside(appDir(application), APK_DIR, storedName);

export const iconPath = (application) =>
  application.icon_stored_name ? inside(appDir(application), application.icon_stored_name) : null;

export const assetsDir = (application) => inside(appDir(application), ASSET_DIR);

export const assetPath = (application, name) => inside(assetsDir(application), name);

/** Create the application folder with its fixed subfolders. */
export async function ensureAppDir(storageDir) {
  const dir = inside(root, storageDir);
  await fs.promises.mkdir(path.join(dir, APK_DIR), { recursive: true });
  await fs.promises.mkdir(path.join(dir, ASSET_DIR), { recursive: true });
  return dir;
}

/**
 * A folder name for an application: its slug, suffixed with -2, -3, … until it
 * is free both on disk and in the database. `isTaken` asks the database.
 */
export async function allocateDir(name, isTaken) {
  const base = slugify(name);
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!fs.existsSync(inside(root, candidate)) && !(await isTaken(candidate))) {
      return candidate;
    }
  }
  throw new Error(`Could not find a free folder name for "${name}".`);
}

/** `desired`, or `name-2.ext`, `name-3.ext`, … if a file by that name exists. */
export function uniqueName(dir, desired) {
  const ext = path.extname(desired);
  const stem = desired.slice(0, desired.length - ext.length);
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? desired : `${stem}-${n}${ext}`;
    if (!fs.existsSync(path.join(dir, candidate))) return candidate;
  }
  throw new Error(`Could not find a free file name for "${desired}".`);
}

/** Move a file, across filesystems if it has to (rename cannot). */
async function move(from, to) {
  try {
    await fs.promises.rename(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fs.promises.copyFile(from, to);
    await fs.promises.unlink(from);
  }
}

/**
 * Move an upload into a folder under public/, under a safe and unique name.
 * Returns the name it was stored as.
 */
export async function placeFile(fromPath, toDir, desiredName) {
  await fs.promises.mkdir(toDir, { recursive: true });
  const name = uniqueName(toDir, desiredName);
  await move(fromPath, inside(toDir, name));
  return name;
}

/** Rename a file in place, keeping it unique. Returns the new name. */
export async function renameFile(dir, fromName, desiredName) {
  if (fromName === desiredName) return fromName;
  const name = uniqueName(dir, desiredName);
  await move(inside(dir, fromName), inside(dir, name));
  return name;
}

export async function renameAppDir(fromDir, toDir) {
  if (fromDir === toDir) return;
  await move(inside(root, fromDir), inside(root, toDir));
}

export async function removeAppDir(storageDir) {
  if (!storageDir) return;
  await fs.promises.rm(inside(root, storageDir), { recursive: true, force: true });
}

export async function removeFile(filePath) {
  if (!filePath) return;
  await fs.promises.rm(filePath, { force: true });
}

/** Files in an application's assets folder, newest first. The folder is the index. */
export async function listAssets(application) {
  const dir = assetsDir(application);
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map(async (entry) => {
        const stat = await fs.promises.stat(path.join(dir, entry.name));
        return { name: entry.name, sizeBytes: stat.size, modifiedAt: stat.mtime };
      }),
  );

  return files.sort((a, b) => b.modifiedAt - a.modifiedAt);
}
