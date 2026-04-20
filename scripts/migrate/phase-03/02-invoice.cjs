'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }        = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }              = require('../lib/state.cjs');
const { toTsStr, countMysqlMatched } = require('../lib/util.cjs');

async function countChildren(table, col, ids) {
  if (!ids || ids.length === 0) return 0;
  const ph = ids.map(() => '?').join(', ');
  const [[{ c }]] = await pool.query(
    `SELECT COUNT(*) c FROM \`${table}\` WHERE \`${col}\` IN (${ph})`,
    ids
  );
  return Number(c);
}

(async () => {
  const db   = await getDb();
  const docs = await db.collection('invoices').find({}).toArray();
  console.log(`[invoice] Mongo docs found: ${docs.length}`);

  let totalLines = 0;

  for (const d of docs) {
    await upsert('invoice', {
      invoice_id:      d.invoiceId,
      organization_id: d.organizationId,
      patient_id:      d.patientId,
      appointment_id:  d.appointmentId || null,
      subtotal:        d.subtotal ?? 0,
      discount:        d.discount ?? 0,
      tax:             d.tax ?? 0,
      total_amount:    d.totalAmount ?? 0,
      paid_amount:     d.paidAmount ?? 0,
      balance_due:     d.balanceDue ?? 0,
      status:          d.status || 'Unpaid',
      created_at:      toTsStr(d.createdAt),
      updated_at:      toTsStr(d.updatedAt),
    }, 'invoice_id');

    await pool.execute('DELETE FROM `invoice_line_items` WHERE `invoice_id` = ?', [d.invoiceId]);
    const lineItems = Array.isArray(d.lineItems) ? d.lineItems : [];
    let sort = 0;
    for (const li of lineItems) {
      await pool.execute(
        `INSERT INTO \`invoice_line_items\` (\`invoice_id\`,\`description\`,\`quantity\`,\`unit_price\`,\`discount\`,\`total\`,\`sort_order\`) VALUES (?,?,?,?,?,?,?)`,
        [d.invoiceId, li.description || null, li.quantity ?? 1, li.unitPrice ?? 0, li.discount ?? 0, li.total ?? 0, sort++]
      );
      totalLines++;
    }
  }

  const ids = docs.map(d => d.invoiceId);
  const mysqlCount = await countMysqlMatched(pool, 'invoice', 'invoice_id', ids);
  const ok = docs.length === mysqlCount;
  await recordTable('invoice', { mongoCount: docs.length, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[invoice] mongo=${docs.length} mysql=${mysqlCount} ok=${ok}`);

  const liMysql = await countChildren('invoice_line_items', 'invoice_id', ids);
  await recordTable('invoice_line_items', { mongoCount: totalLines, mysqlCount: liMysql, ok: totalLines === liMysql, lastRun: new Date().toISOString() });
  console.log(`[invoice_line_items] mongo=${totalLines} mysql=${liMysql} ok=${totalLines === liMysql}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
