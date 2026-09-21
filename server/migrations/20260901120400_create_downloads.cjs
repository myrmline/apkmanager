/** One row per download, so an admin can see who actually took a build. */
exports.up = (knex) =>
  knex.schema.createTable('downloads', (table) => {
    table.increments('id').primary();
    table
      .integer('version_id')
      .notNullable()
      .references('id')
      .inTable('file_versions')
      .onDelete('CASCADE');
    // Keep the count if the account goes away.
    table.integer('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('version_id', 'downloads_version_idx');
  });

exports.down = (knex) => knex.schema.dropTableIfExists('downloads');
