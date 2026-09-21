/**
 * The logical app record. Binaries live in file_versions, so renaming a build
 * or archiving it never touches its history.
 */
exports.up = async (knex) => {
  await knex.schema.createTable('files', (table) => {
    table.increments('id').primary();
    table.text('name').notNullable();
    table.text('package_name');
    table.text('description');
    table.text('status').notNullable().defaultTo('active');
    // Keep the build if the uploader's account is deleted.
    table.integer('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('status', 'files_status_idx');
  });

  await knex.raw(
    `ALTER TABLE files ADD CONSTRAINT files_status_check CHECK (status IN ('active', 'archived'))`,
  );
};

exports.down = (knex) => knex.schema.dropTableIfExists('files');
