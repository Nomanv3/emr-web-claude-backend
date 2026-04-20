// Phase 4 cut-over (2026-04-19): MongoDB was retired — MySQL is the sole
// runtime datastore. The original Mongoose-based seeder has been removed.
//
// The MySQL database already contains all historic + seed data (copied from
// the old Atlas cluster via the Phase 15 migration scripts at
// `backend/scripts/migrate/`). Re-seeding, if ever needed, should be done by:
//
//   1. Running `database/db.sql` against a clean MySQL schema, which will
//      create all 42 tables AND insert the baseline sample rows.
//   2. Or re-running the Phase 15 migration scripts from a Mongo backup:
//         node backend/scripts/migrate/run-all.cjs --phase 1
//         node backend/scripts/migrate/run-all.cjs --phase 2
//         node backend/scripts/migrate/run-all.cjs --phase 3
//
// See `database/migration.md` for the full catalog of migration scripts and
// verification tooling (count checks, FK integrity, spot-checks).

console.error(
  'The Mongoose-based seeder has been removed (Phase 4 cut-over, 2026-04-19).\n' +
  'MySQL already contains the data. To reset/rebuild the schema:\n' +
  '  \u2022 Run database/db.sql in MySQL Workbench, OR\n' +
  '  \u2022 Re-run the Phase 15 migration scripts under backend/scripts/migrate/.'
);
process.exit(1);
