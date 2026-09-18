import pg from 'pg';
import { config } from './lib/config.js';

// BIGINT (size_bytes) arrives as a string by default; we want a number.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => parseInt(value, 10));

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error', err);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Run a callback inside a transaction, rolling back on any error. */
export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
