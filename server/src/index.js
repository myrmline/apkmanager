import { createApp } from './app.js';
import { config } from './lib/config.js';
import { pool } from './db.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

const shutdown = async () => {
  server.close();
  await pool.end();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
