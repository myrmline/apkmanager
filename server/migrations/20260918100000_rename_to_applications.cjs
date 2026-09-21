/**
 * The file record grows into a full application record, so the tables take the
 * vocabulary the product uses: applications, their apk_versions, and the grants
 * that connect them to users.
 */
exports.up = async (knex) => {
  await knex.schema.renameTable('files', 'applications');
  await knex.schema.renameTable('file_versions', 'apk_versions');
  await knex.schema.renameTable('file_access', 'application_access');

  await knex.schema.alterTable('apk_versions', (table) => {
    table.renameColumn('file_id', 'application_id');
    // Every version now carries its own description, not just release notes.
    table.renameColumn('notes', 'description');
  });

  await knex.schema.alterTable('application_access', (table) => {
    table.renameColumn('file_id', 'application_id');
  });

  // Indexes and constraints keep their old names through a rename, so bring
  // them along too — a confusing name in psql outlives whoever wrote it.
  const renames = [
    ['INDEX', 'files_status_idx', 'applications_status_idx'],
    ['INDEX', 'file_versions_file_idx', 'apk_versions_application_idx'],
    ['INDEX', 'file_versions_one_current_idx', 'apk_versions_one_current_idx'],
    ['INDEX', 'file_versions_file_version_unique', 'apk_versions_version_unique'],
    ['INDEX', 'file_access_user_idx', 'application_access_user_idx'],
  ];
  for (const [kind, from, to] of renames) {
    await knex.raw(`ALTER ${kind} IF EXISTS ?? RENAME TO ??`, [from, to]);
  }

  await knex.raw(
    `ALTER TABLE applications RENAME CONSTRAINT files_status_check TO applications_status_check`,
  );
  await knex.raw(
    `ALTER TABLE apk_versions RENAME CONSTRAINT file_versions_status_check TO apk_versions_status_check`,
  );
};

exports.down = async (knex) => {
  await knex.raw(
    `ALTER TABLE apk_versions RENAME CONSTRAINT apk_versions_status_check TO file_versions_status_check`,
  );
  await knex.raw(
    `ALTER TABLE applications RENAME CONSTRAINT applications_status_check TO files_status_check`,
  );

  const renames = [
    ['INDEX', 'applications_status_idx', 'files_status_idx'],
    ['INDEX', 'apk_versions_application_idx', 'file_versions_file_idx'],
    ['INDEX', 'apk_versions_one_current_idx', 'file_versions_one_current_idx'],
    ['INDEX', 'apk_versions_version_unique', 'file_versions_file_version_unique'],
    ['INDEX', 'application_access_user_idx', 'file_access_user_idx'],
  ];
  for (const [kind, from, to] of renames) {
    await knex.raw(`ALTER ${kind} IF EXISTS ?? RENAME TO ??`, [from, to]);
  }

  await knex.schema.alterTable('application_access', (table) => {
    table.renameColumn('application_id', 'file_id');
  });
  await knex.schema.alterTable('apk_versions', (table) => {
    table.renameColumn('application_id', 'file_id');
    table.renameColumn('description', 'notes');
  });

  await knex.schema.renameTable('application_access', 'file_access');
  await knex.schema.renameTable('apk_versions', 'file_versions');
  await knex.schema.renameTable('applications', 'files');
};
