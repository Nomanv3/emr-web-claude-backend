// One-shot cleanup: delete 15 stale sample-seed rows left over from db.sql's
// INSERT blocks that don't match any MongoDB doc. See migration.md §10 for
// root-cause analysis. After running this, phase-01-counts.cjs should be all ✓.
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { pool, closeMysql } = require('../lib/mysql.cjs');

const STALE = {
  master_salutation: {
    col: 'salutation_id',
    ids: [
      'f5c52f5c-3a62-11f1-97db-10ffe0fbdb4d',
      'f5c53355-3a62-11f1-97db-10ffe0fbdb4d',
      'f5c53494-3a62-11f1-97db-10ffe0fbdb4d',
      'f5c5356d-3a62-11f1-97db-10ffe0fbdb4d',
      'f5c5362e-3a62-11f1-97db-10ffe0fbdb4d',
      'f5c53700-3a62-11f1-97db-10ffe0fbdb4d',
    ],
  },
  master_symptom: {
    col: 'symptom_id',
    ids: [
      'f5c2082c-3a62-11f1-97db-10ffe0fbdb4d',
      'f5c20be3-3a62-11f1-97db-10ffe0fbdb4d',
      'f5c20d2b-3a62-11f1-97db-10ffe0fbdb4d',
    ],
  },
  master_diagnosis: {
    col: 'diagnosis_id',
    ids: [
      'f5c2f014-3a62-11f1-97db-10ffe0fbdb4d',
      'f5c2f288-3a62-11f1-97db-10ffe0fbdb4d',
      'f5c2f362-3a62-11f1-97db-10ffe0fbdb4d',
    ],
  },
  master_medication: {
    col: 'medication_id',
    ids: [
      'f5c4232b-3a62-11f1-97db-10ffe0fbdb4d',
      'f5c425ef-3a62-11f1-97db-10ffe0fbdb4d',
      'f5c42723-3a62-11f1-97db-10ffe0fbdb4d',
    ],
  },
};

(async () => {
  let totalDeleted = 0;
  for (const [table, { col, ids }] of Object.entries(STALE)) {
    const placeholders = ids.map(() => '?').join(',');
    const [res] = await pool.query(
      `DELETE FROM \`${table}\` WHERE \`${col}\` IN (${placeholders})`,
      ids
    );
    console.log(`${table}: deleted ${res.affectedRows} stale rows`);
    totalDeleted += res.affectedRows;
  }
  console.log(`\nTotal stale rows deleted: ${totalDeleted}`);
  await closeMysql();
})();
