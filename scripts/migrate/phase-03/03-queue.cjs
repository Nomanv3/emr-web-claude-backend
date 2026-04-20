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
  const docs = await db.collection('queues').find({}).toArray();
  console.log(`[queue] Mongo docs found: ${docs.length}`);

  let totalSvc = 0;

  for (const d of docs) {
    await upsert('queue', {
      queue_id:         d.queueId,
      organization_id:  d.organizationId,
      branch_id:        d.branchId,
      appointment_id:   d.appointmentId || null,
      patient_id:       d.patientId,
      patient_name:     d.patientName || null,
      uhid:             d.uhid || null,
      token_number:     d.tokenNumber ?? null,
      slot:             d.slot || null,
      queue_date:       d.queueDate,
      arrival_time:     toTsStr(d.arrivalTime),
      status:           d.status || 'Waiting',
      payment_status:   d.paymentStatus || null,
      payment_amount:   d.paymentAmount ?? 0,
      service_amount:   d.serviceAmount ?? 0,
      appointment_type: d.appointmentType || 'walk_in',
      check_in_time:    d.checkInTime || null,
      tags:             Array.isArray(d.tags) ? d.tags.join(',') : (d.tags || null),
      duration_minutes: d.durationMinutes ?? 15,
      invoice_id:       d.invoiceId || null,
      notes:            d.notes || null,
      created_by:       d.createdBy || null,
      created_at:       toTsStr(d.createdAt),
      updated_at:       toTsStr(d.updatedAt),
    }, 'queue_id');

    await pool.execute('DELETE FROM `queue_services` WHERE `queue_id` = ?', [d.queueId]);
    const services = Array.isArray(d.services) ? d.services : [];
    for (const s of services) {
      await pool.execute(
        'INSERT INTO `queue_services` (`queue_id`,`service_id`,`name`,`price`) VALUES (?,?,?,?)',
        [d.queueId, s.serviceId || null, s.name || null, s.price ?? 0]
      );
      totalSvc++;
    }
  }

  const ids = docs.map(d => d.queueId);
  const mysqlCount = await countMysqlMatched(pool, 'queue', 'queue_id', ids);
  const ok = docs.length === mysqlCount;
  await recordTable('queue', { mongoCount: docs.length, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[queue] mongo=${docs.length} mysql=${mysqlCount} ok=${ok}`);

  const svcMysql = await countChildren('queue_services', 'queue_id', ids);
  await recordTable('queue_services', { mongoCount: totalSvc, mysqlCount: svcMysql, ok: totalSvc === svcMysql, lastRun: new Date().toISOString() });
  console.log(`[queue_services] mongo=${totalSvc} mysql=${svcMysql} ok=${totalSvc === svcMysql}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
