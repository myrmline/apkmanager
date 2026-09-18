import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { config } from '../lib/config.js';

const people = [
  { name: 'Release Admin', email: config.seed.adminEmail, password: config.seed.adminPassword, role: 'admin' },
  { name: 'Amira Ben Salah', email: 'amira@example.com', password: 'tester1234', role: 'user' },
  { name: 'Karim Trabelsi', email: 'karim@example.com', password: 'tester1234', role: 'user' },
  { name: 'Lina Haddad', email: 'lina@example.com', password: 'tester1234', role: 'user' },
];

const run = async () => {
  for (const person of people) {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
      [person.name, person.email.toLowerCase(), await bcrypt.hash(person.password, 10), person.role],
    );
    console.log(`${person.role.padEnd(5)}  ${person.email}  (password: ${person.password})`);
  }
  console.log('\nSeed complete. Sign in with the admin account above.');
  await pool.end();
};

run().catch(async (err) => {
  console.error(err.message);
  await pool.end();
  process.exit(1);
});
