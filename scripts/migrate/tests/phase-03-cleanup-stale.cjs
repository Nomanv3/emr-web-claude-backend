'use strict';
// Wipe Phase 3 MySQL tables clean before running Phase 3 migration.
// All current rows in these tables come from db.sql sample-seed INSERTs
// (the few orphan child rows left after Phase 2 cleanup). None of them
// come from Mongo yet. We truncate rather than delete-where so the scripts
// start from a blank slate — migration is idempotent and will repopulate
// from Mongo source of truth.
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { pool, closeMysql } = require('../lib/mysql.cjs');

const TABLES_REVERSE_ORDER = [
  // children first
  'prescription_custom_section_items',
  'prescription_custom_sections',
  'prescription_vitals',
  'prescription_section_config',
  'prescription_symptoms',
  'prescription_diagnoses',
  'prescription_examination_findings',
  'prescription_medications',
  'prescription_lab_investigations',
  'prescription_lab_results',
  'prescription_procedures',
  'prescription',
  'receipt',
  'payment',
  'queue_services',
  'queue',
  'invoice_line_items',
  'invoice',
  'appointment_services',
  'appointment_service_ids',
  'appointment',
];

(async () => {
  await pool.query('SET FOREIGN_KEY_CHECKS=0');
  for (const t of TABLES_REVERSE_ORDER) {
    const [res] = await pool.query(`DELETE FROM \`${t}\``);
    if (res.affectedRows > 0) {
      console.log(`${t}: deleted ${res.affectedRows} stale rows`);
    }
  }
  await pool.query('SET FOREIGN_KEY_CHECKS=1');
  await closeMysql();
})().catch((e) => { console.error(e); process.exit(1); });
