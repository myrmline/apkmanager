/**
 * An icon for each application. The image sits next to the APKs on disk and is
 * served through an authorised endpoint, so only the columns describing it live
 * in the database.
 */
exports.up = (knex) =>
  knex.schema.alterTable('applications', (table) => {
    table.text('icon_stored_name');
    table.text('icon_original_name');
    table.text('icon_mime');
  });

exports.down = (knex) =>
  knex.schema.alterTable('applications', (table) => {
    table.dropColumn('icon_stored_name');
    table.dropColumn('icon_original_name');
    table.dropColumn('icon_mime');
  });
