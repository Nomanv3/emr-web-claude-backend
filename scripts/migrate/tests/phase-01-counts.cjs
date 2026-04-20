'use strict';
// Test A — count parity: verify Mongo vs MySQL row counts for all 11 Phase 1 tables.
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo } = require('../lib/mongo.cjs');
const { pool, closeMysql }  = require('../lib/mysql.cjs');

// Map: [ mongoCollection, mysqlTable, mysqlCountSQL ]
const PAIRS = [
  { mongo: 'organizations',              table: 'organization',              sql: 'SELECT COUNT(*) AS c FROM `organization`' },
  { mongo: 'branches',                   table: 'branch',                    sql: 'SELECT COUNT(*) AS c FROM `branch`' },
  { mongo: 'mastersalutations',          table: 'master_salutation',         sql: 'SELECT COUNT(*) AS c FROM `master_salutation`' },
  { mongo: 'mastersymptoms',             table: 'master_symptom',            sql: 'SELECT COUNT(*) AS c FROM `master_symptom`' },
  { mongo: 'masterdiagnoses',            table: 'master_diagnosis',          sql: 'SELECT COUNT(*) AS c FROM `master_diagnosis`' },
  { mongo: 'mastermedications',          table: 'master_medication',         sql: 'SELECT COUNT(*) AS c FROM `master_medication`' },
  { mongo: 'masterlabtests',             table: 'master_lab_test',           sql: 'SELECT COUNT(*) AS c FROM `master_lab_test`' },
  { mongo: 'masterexaminationfindings',  table: 'master_examination_finding',sql: 'SELECT COUNT(*) AS c FROM `master_examination_finding`' },
  { mongo: 'masterprocedures',           table: 'master_procedure',          sql: 'SELECT COUNT(*) AS c FROM `master_procedure`' },
  { mongo: 'masterservices',             table: 'master_service',            sql: 'SELECT COUNT(*) AS c FROM `master_service`' },
  { mongo: 'dropdownoptions',            table: 'dropdown_option',           sql: 'SELECT COUNT(*) AS c FROM `dropdown_option`' },
];

(async () => {
  const db = await getDb();
  let anyMismatch = false;

  const COL_W = 30;
  const header = `${'Collection/Table'.padEnd(COL_W)} | ${'Mongo'.padStart(6)} | ${'MySQL'.padStart(6)} | Match`;
  console.log('\n=== Test A: Count Parity ===');
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const p of PAIRS) {
    const mongoCount = await db.collection(p.mongo).countDocuments({});
    const [[{ c }]] = await pool.query(p.sql);
    const mysqlCount = Number(c);
    const match = mongoCount === mysqlCount;
    if (!match) anyMismatch = true;
    const marker = match ? '  ✓' : '  ✗  <<< MISMATCH';
    console.log(`${p.table.padEnd(COL_W)} | ${String(mongoCount).padStart(6)} | ${String(mysqlCount).padStart(6)} |${marker}`);
  }

  console.log('');
  if (anyMismatch) {
    console.error('RESULT: FAIL — one or more count mismatches detected.');
  } else {
    console.log('RESULT: PASS — all counts match.');
  }

  await closeMongo();
  await closeMysql();
  process.exit(anyMismatch ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
