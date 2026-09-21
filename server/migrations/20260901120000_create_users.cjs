/** People who can sign in. Two roles: admin and user. */
exports.up = async (knex) => {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.text('name').notNullable();
    table.text('email').notNullable().unique();
    table.text('password_hash').notNullable();
    table.text('role').notNullable().defaultTo('user');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'))`,
  );

  // Logins match on lower(email), so index the same expression.
  await knex.raw('CREATE INDEX users_email_lower_idx ON users (lower(email))');
};

exports.down = (knex) => knex.schema.dropTableIfExists('users');
