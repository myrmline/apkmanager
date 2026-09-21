/**
 * One row per uploaded APK.
 *
 * status: draft (admins only) | published (assigned users) | archived (history)
 * is_current: the version offered by default. A partial unique index lets the
 * database, not the application, guarantee there is only ever one per file.
 */
exports.up = async (knex) => {
  await knex.schema.createTable('file_versions', (table) => {
    table.increments('id').primary();
    table
      .integer('file_id')
      .notNullable()
      .references('id')
      .inTable('files')
      .onDelete('CASCADE');
    table.text('version').notNullable();
    table.text('notes');
    table.text('status').notNullable().defaultTo('published');
    table.boolean('is_current').notNullable().defaultTo(false);
    table.text('original_name').notNullable();
    table.text('stored_name').notNullable().unique();
    table.bigInteger('size_bytes').notNullable();
    table.text('checksum');
    table.integer('uploaded_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('uploaded_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['file_id', 'version'], { indexName: 'file_versions_file_version_unique' });
    table.index(['file_id', 'uploaded_at'], 'file_versions_file_idx');
  });

  await knex.raw(
    `ALTER TABLE file_versions ADD CONSTRAINT file_versions_status_check
       CHECK (status IN ('draft', 'published', 'archived'))`,
  );

  await knex.raw(
    `CREATE UNIQUE INDEX file_versions_one_current_idx
       ON file_versions (file_id) WHERE is_current`,
  );
};

exports.down = (knex) => knex.schema.dropTableIfExists('file_versions');
