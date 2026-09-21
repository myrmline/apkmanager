/**
 * Per-version access.
 *
 * A version with no rows here inherits the application's access list, which is
 * the normal case. Adding rows narrows that version to exactly the people
 * listed — useful for a beta that only two testers should see.
 */
exports.up = (knex) =>
  knex.schema.createTable('version_access', (table) => {
    table
      .integer('version_id')
      .notNullable()
      .references('id')
      .inTable('apk_versions')
      .onDelete('CASCADE');
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('granted_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('granted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.primary(['version_id', 'user_id']);
    table.index('user_id', 'version_access_user_idx');
  });

exports.down = (knex) => knex.schema.dropTableIfExists('version_access');
