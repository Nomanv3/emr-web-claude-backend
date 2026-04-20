'use strict';
// Delete stale sample-seed rows left over from db.sql INSERT blocks that have
// no matching MongoDB document. Child tables CASCADE on delete, so we only
// need to delete parent rows. Idempotent.
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { pool, closeMysql } = require('../lib/mysql.cjs');

const STALE = [
  ['patient',               'patient_id',  ['pat-001', 'pat-002']],
  ['patient_medical_history','history_id', ['hist-001']],
  ['prescription_config',   'config_id',   ['cfg-001']],
  ['prescription_template', 'template_id', ['tpl-global-001', 'tpl-main-001']],
  ['print_settings',        'settings_id', ['ps-001']],
];

// These stale patients/configs are referenced by other sample-seed rows in
// Phase 3 tables (invoice, appointment, queue, prescription, payment, etc.).
// Rather than map every FK chain, we drop ALL stale sample-seed Phase 3 rows
// alongside — the pattern is: any row whose UUID starts with a known seed
// prefix (e.g. 'app-', 'inv-', 'pay-', 'rcpt-', 'q-', 'rx-') is from db.sql,
// not from Mongo. We will re-hydrate these tables from Mongo in Phase 3.
const PHASE3_SEED_PREFIXES = {
  appointment:   { col: 'appointment_id',  prefixes: ['app-']  },
  invoice:       { col: 'invoice_id',      prefixes: ['inv-']  },
  queue:         { col: 'queue_id',        prefixes: ['q-']    },
  payment:       { col: 'payment_id',      prefixes: ['pay-']  },
  receipt:       { col: 'receipt_id',      prefixes: ['rcpt-'] },
  prescription:  { col: 'prescription_id', prefixes: ['rx-']   },
};

(async () => {
  // Disable FK checks for the cleanup window so we can delete in any order.
  await pool.query('SET FOREIGN_KEY_CHECKS=0');

  let total = 0;

  // 1. Purge Phase 3 sample-seed rows by id-prefix.
  for (const [table, { col, prefixes }] of Object.entries(PHASE3_SEED_PREFIXES)) {
    for (const p of prefixes) {
      const [res] = await pool.query(
        `DELETE FROM \`${table}\` WHERE \`${col}\` LIKE ?`,
        [`${p}%`]
      );
      if (res.affectedRows > 0) {
        console.log(`${table} (${p}*): deleted ${res.affectedRows} stale rows`);
        total += res.affectedRows;
      }
    }
  }

  // 2. Purge explicit stale Phase 2 rows by UUID list.
  for (const [table, col, ids] of STALE) {
    const ph = ids.map(() => '?').join(', ');
    const [res] = await pool.query(
      `DELETE FROM \`${table}\` WHERE \`${col}\` IN (${ph})`,
      ids
    );
    console.log(`${table}: deleted ${res.affectedRows} stale rows`);
    total += res.affectedRows;
  }

  await pool.query('SET FOREIGN_KEY_CHECKS=1');
  console.log(`\nTotal stale rows deleted: ${total}`);
  await closeMysql();
})().catch((e) => { console.error(e); process.exit(1); });
