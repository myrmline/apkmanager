/**
 * Applications are activated or deactivated by an admin, matching the switch on
 * each APK version. The old 'archived' value becomes 'inactive'.
 */
exports.up = async (knex) => {
  await knex.raw('ALTER TABLE applications DROP CONSTRAINT applications_status_check');
  await knex.raw(`UPDATE applications SET status = 'inactive' WHERE status = 'archived'`);
  await knex.raw(
    `ALTER TABLE applications ADD CONSTRAINT applications_status_check
       CHECK (status IN ('active', 'inactive'))`,
  );
};

exports.down = async (knex) => {
  await knex.raw('ALTER TABLE applications DROP CONSTRAINT applications_status_check');
  await knex.raw(`UPDATE applications SET status = 'archived' WHERE status = 'inactive'`);
  await knex.raw(
    `ALTER TABLE applications ADD CONSTRAINT applications_status_check
       CHECK (status IN ('active', 'archived'))`,
  );
};
