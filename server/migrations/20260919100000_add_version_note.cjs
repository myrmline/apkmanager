/**
 * A free-form note on a version — a remark an admin leaves for whoever looks at
 * this build later, separate from the release description.
 */
exports.up = (knex) =>
  knex.schema.alterTable('apk_versions', (table) => {
    table.text('note');
  });

exports.down = (knex) =>
  knex.schema.alterTable('apk_versions', (table) => {
    table.dropColumn('note');
  });
