'use strict';
// Payment is inserted WITHOUT receipt_id. Receipt gets inserted next, then
// 06-receipt-backfill.cjs UPDATEs payment.receipt_id. This breaks the
// payment↔receipt circular dep (payment.receipt_id intentionally has no FK).
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }        = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }              = require('../lib/state.cjs');
const { toTsStr, countMysqlMatched } = require('../lib/util.cjs');

(async () => {
  const db   = await getDb();
  const docs = await db.collection('payments').find({}).toArray();
  console.log(`[payment] Mongo docs found: ${docs.length}`);

  for (const d of docs) {
    await upsert('payment', {
      payment_id:      d.paymentId,
      invoice_id:      d.invoiceId,
      amount:          d.amount ?? 0,
      method:          d.method || 'Cash',
      transaction_ref: d.transactionRef || null,
      collected_by:    d.collectedBy || null,
      collected_at:    toTsStr(d.collectedAt) || toTsStr(d.createdAt),
      receipt_id:      null, // back-filled in 06
      created_at:      toTsStr(d.createdAt),
      updated_at:      toTsStr(d.updatedAt),
    }, 'payment_id');
  }

  const ids = docs.map(d => d.paymentId);
  const mysqlCount = await countMysqlMatched(pool, 'payment', 'payment_id', ids);
  const ok = docs.length === mysqlCount;
  await recordTable('payment', { mongoCount: docs.length, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[payment] mongo=${docs.length} mysql=${mysqlCount} ok=${ok}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
