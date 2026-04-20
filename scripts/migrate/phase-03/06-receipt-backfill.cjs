'use strict';
// Back-fill payment.receipt_id from receipt.payment_id after both tables are loaded.
// This is the only way to populate the field because payment↔receipt is a
// cycle with FK only on receipt→payment; payment.receipt_id has no FK.
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { pool, closeMysql } = require('../lib/mysql.cjs');

(async () => {
  const [res] = await pool.query(
    `UPDATE payment p
       JOIN receipt r ON r.payment_id = p.payment_id
        SET p.receipt_id = r.receipt_id`
  );
  console.log(`[payment.receipt_id back-fill] affected=${res.affectedRows}, changed=${res.changedRows ?? 'n/a'}`);

  const [[{ c }]] = await pool.query('SELECT COUNT(*) c FROM payment WHERE receipt_id IS NOT NULL');
  const [[{ r }]] = await pool.query('SELECT COUNT(*) r FROM receipt');
  console.log(`payment.receipt_id populated: ${c} (receipts exist: ${r})`);
  await closeMysql();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
