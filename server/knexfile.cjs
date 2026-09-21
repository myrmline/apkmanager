// CommonJS on purpose: the Knex CLI loads this file directly, while the rest of
// the server runs as ESM. Same for the migration and seed files (.cjs).
require('dotenv').config();

const path = require('node:path');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.');
}

const shared = {
  client: 'pg',
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    extension: 'cjs',
    loadExtensions: ['.cjs'],
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: path.join(__dirname, 'seeds'),
    extension: 'cjs',
    loadExtensions: ['.cjs'],
  },
};

module.exports = {
  development: {
    ...shared,
    connection: process.env.DATABASE_URL,
    pool: { min: 0, max: 5 },
  },

  test: {
    ...shared,
    connection: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL,
    pool: { min: 0, max: 5 },
  },

  production: {
    ...shared,
    connection: {
      connectionString: process.env.DATABASE_URL,
      // Most hosted Postgres instances need TLS.
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    },
    pool: { min: 2, max: 10 },
  },
};
