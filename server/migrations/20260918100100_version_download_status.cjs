/**
 * Download availability per version. The old three-state `status` column
 * (draft / published / archived) collapses into two plain facts:
 *
 *   is_active   an admin switch: can this version be downloaded at all
 *   expires_at  an optional deadline, after which it cannot
 *
 * The status shown in the interface — Active, Inactive, Expired — is derived
 * from those two, so there is only one place to change and nothing to keep in
 * sync.
 */
exports.up = async (knex) => {
  await knex.schema.alterTable('apk_versions', (table) => {
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('expires_at', { useTz: true });
  });

  // Anything previously held back as a draft or retired stays undownloadable.
  await knex.raw(`UPDATE apk_versions SET is_active = (status = 'published')`);

  await knex.schema.alterTable('apk_versions', (table) => {
    table.dropColumn('status'); // takes apk_versions_status_check with it
  });

  await knex.raw('CREATE INDEX apk_versions_expires_idx ON apk_versions (expires_at)');
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS apk_versions_expires_idx');

  await knex.schema.alterTable('apk_versions', (table) => {
    table.text('status').notNullable().defaultTo('published');
  });
  await knex.raw(
    `ALTER TABLE apk_versions ADD CONSTRAINT apk_versions_status_check
       CHECK (status IN ('draft', 'published', 'archived'))`,
  );
  await knex.raw(`UPDATE apk_versions SET status = CASE WHEN is_active THEN 'published' ELSE 'draft' END`);

  await knex.schema.alterTable('apk_versions', (table) => {
    table.dropColumn('is_active');
    table.dropColumn('expires_at');
  });
};
