/**
 * Who may download which build. The composite primary key means a user cannot
 * be granted the same file twice, and both sides cascade on delete.
 */
exports.up = (knex) =>
  knex.schema.createTable('file_access', (table) => {
    table.integer('file_id').notNullable().references('id').inTable('files').onDelete('CASCADE');
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('granted_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('granted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.primary(['file_id', 'user_id']);
    table.index('user_id', 'file_access_user_idx');
  });

exports.down = (knex) => knex.schema.dropTableIfExists('file_access');
