'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }        = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }              = require('../lib/state.cjs');
const { toTsStr, countMysqlMatched } = require('../lib/util.cjs');

(async () => {
  const db   = await getDb();
  const docs = await db.collection('receipts').find({}).toArray();
  console.log(`[receipt] Mongo docs found: ${docs.length}`);

  for (const d of docs) {
    await upsert('receipt', {
      receipt_id:     d.receiptId,
      payment_id:     d.paymentId,
      invoice_id:     d.invoiceId,
      receipt_number: d.receiptNumber,
      pdf_url:        d.pdfUrl || null,
      generated_at:   toTsStr(d.generatedAt) || toTsStr(d.createdAt),
      created_at:     toTsStr(d.createdAt),
      updated_at:     toTsStr(d.updatedAt),
    }, 'receipt_id');
  }

  const ids = docs.map(d => d.receiptId);
  const mysqlCount = await countMysqlMatched(pool, 'receipt', 'receipt_id', ids);
  const ok = docs.length === mysqlCount;
  await recordTable('receipt', { mongoCount: docs.length, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[receipt] mongo=${docs.length} mysql=${mysqlCount} ok=${ok}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
