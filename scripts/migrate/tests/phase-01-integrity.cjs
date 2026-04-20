'use strict';
// Test C — relational integrity: verify no orphan FKs in Phase 1 tables.
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { pool, closeMysql } = require('../lib/mysql.cjs');

(async () => {
  console.log('\n=== Test C: Relational Integrity ===\n');

  let anyOrphans = false;

  // 1. Every branch must point at an existing org
  {
    const [[{ orphans }]] = await pool.query(`
      SELECT COUNT(*) AS orphans
      FROM branch b
      LEFT JOIN organization o ON o.organization_id = b.organization_id
      WHERE o.id IS NULL
    `);
    const count = Number(orphans);
    const pass  = count === 0;
    if (!pass) anyOrphans = true;
    console.log(`branch → organization orphans: ${count}  ${pass ? '✓' : '✗ FAIL'}`);
  }

  // 2. master_* → organization (nullable FK — only check rows that have a non-null org_id)
  const masterChecks = [
    { table: 'master_symptom',            col: 'organization_id' },
    { table: 'master_diagnosis',          col: 'organization_id' },
    { table: 'master_medication',         col: 'organization_id' },
    { table: 'master_lab_test',           col: 'organization_id' },
    { table: 'master_examination_finding',col: 'organization_id' },
    { table: 'master_procedure',          col: 'organization_id' },
    { table: 'master_service',            col: 'organization_id' },
  ];

  for (const mc of masterChecks) {
    const [[{ orphans }]] = await pool.query(`
      SELECT COUNT(*) AS orphans
      FROM \`${mc.table}\` m
      LEFT JOIN organization o ON o.organization_id = m.${mc.col}
      WHERE m.${mc.col} IS NOT NULL AND o.id IS NULL
    `);
    const count = Number(orphans);
    const pass  = count === 0;
    if (!pass) anyOrphans = true;
    console.log(`${mc.table} → organization orphans: ${count}  ${pass ? '✓' : '✗ FAIL'}`);
  }

  // 3. master_salutation has no org FK — just confirm the table is non-empty
  {
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM master_salutation');
    console.log(`master_salutation row count: ${Number(cnt)} (sanity only, no FK)`);
  }

  // 4. Every master_service that has a non-null organization_id exists in organization
  // (already covered above, but let's also check its branch_id nullable FK consistency)
  {
    const [[{ orphans }]] = await pool.query(`
      SELECT COUNT(*) AS orphans
      FROM master_service m
      LEFT JOIN branch b ON b.branch_id = m.branch_id
      WHERE m.branch_id IS NOT NULL AND b.id IS NULL
    `);
    const count = Number(orphans);
    const pass  = count === 0;
    if (!pass) anyOrphans = true;
    console.log(`master_service → branch orphans: ${count}  ${pass ? '✓' : '✗ FAIL'}`);
  }

  console.log('');
  if (anyOrphans) {
    console.error('RESULT: FAIL — orphan FK violations found.');
  } else {
    console.log('RESULT: PASS — no orphan FK violations.');
  }

  await closeMysql();
  process.exit(anyOrphans ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
