const bcrypt = require('bcryptjs');

require('dotenv').config();

/**
 * Accounts. Run as an upsert on email, so re-seeding resets these passwords
 * without touching any other account you have created in the app.
 */
const people = [
  {
    name: 'Release Admin',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'admin1234',
    role: 'admin',
  },
  { name: 'Amira Ben Salah', email: 'amira@example.com', password: 'tester1234', role: 'user' },
  { name: 'Karim Trabelsi', email: 'karim@example.com', password: 'tester1234', role: 'user' },
  { name: 'Lina Haddad', email: 'lina@example.com', password: 'tester1234', role: 'user' },
];

exports.seed = async (knex) => {
  const rows = await Promise.all(
    people.map(async (person) => ({
      name: person.name,
      email: person.email.toLowerCase(),
      password_hash: await bcrypt.hash(person.password, 10),
      role: person.role,
      is_active: true,
      updated_at: knex.fn.now(),
    })),
  );

  await knex('users')
    .insert(rows)
    .onConflict('email')
    .merge(['name', 'password_hash', 'role', 'is_active', 'updated_at']);

  console.log('\nAccounts ready:');
  people.forEach((person) =>
    console.log(`  ${person.role.padEnd(5)}  ${person.email.padEnd(22)}  ${person.password}`),
  );
};
