import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const drop = process.argv.includes('--drop');

const run = async () => {
  if (drop) {
    console.log('Dropping existing tables…');
    await pool.query(
      'DROP TABLE IF EXISTS downloads, file_access, file_versions, files, users CASCADE',
    );
  }
  const sql = await fs.readFile(path.join(here, '..', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema is up to date.');
  await pool.end();
};

run().catch(async (err) => {
  console.error(err.message);
  await pool.end();
  process.exit(1);
});
