import knexLib from 'knex';
import pg from 'pg';
import knexConfig from '../knexfile.cjs';

// BIGINT (size_bytes, count(*)) arrives as a string by default; we want numbers.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => parseInt(value, 10));

const environment = process.env.NODE_ENV || 'development';

/**
 * One Knex instance for the whole app, built from the same knexfile the
 * migrations and seeds use. Every query in the routes goes through the query
 * builder — there is no raw SQL anywhere in src/.
 */
export const db = knexLib(knexConfig[environment] || knexConfig.development);

/** Run a callback inside a transaction, rolling back on any error. */
export const transaction = (callback) => db.transaction(callback);
