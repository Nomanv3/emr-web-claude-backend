'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }        = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }              = require('../lib/state.cjs');
const { toTsStr, toBool, countMysqlMatched } = require('../lib/util.cjs');

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
  const docs = await db.collection('appointments').find({}).toArray();
  console.log(`[appointment] Mongo docs found: ${docs.length}`);

  // Pass 1: insert parent rows without parent_appointment_id so FK to self
  // cannot fail ordering-wise. We'll back-fill parents in pass 2.
  for (const d of docs) {
    await upsert('appointment', {
      appointment_id:        d.appointmentId,
      organization_id:       d.organizationId,
      branch_id:             d.branchId,
      patient_id:            d.patientId,
      patient_name:          d.patientName || null,
      phone:                 d.phone || null,
      doctor_id:             d.doctorId,
      slot:                  d.slot || null,
      slot_date:             d.slotDate || null,
      slot_start_utc:        toTsStr(d.slotStartUTC),
      slot_end_utc:          toTsStr(d.slotEndUTC),
      appointment_time:      d.appointmentTime || null,
      start_time:            d.startTime || null,
      end_time:              d.endTime || null,
      duration_minutes:      d.durationMinutes ?? 15,
      tags:                  Array.isArray(d.tags) ? d.tags.join(',') : (d.tags || null),
      follow_up_date:        d.followUpDate || null,
      status:                d.status || 'Booked',
      payment_status:        d.paymentStatus || 'Pending',
      notes:                 d.notes || null,
      is_follow_up:          toBool(d.isFollowUp ? 1 : 0),
      parent_appointment_id: null, // pass 2
      created_by:            d.createdBy || null,
      created_at:            toTsStr(d.createdAt),
      updated_at:            toTsStr(d.updatedAt),
    }, 'appointment_id');
  }

  // Pass 2: back-fill parent_appointment_id now that all parents exist.
  for (const d of docs) {
    if (d.parentAppointmentId) {
      await pool.execute(
        'UPDATE `appointment` SET `parent_appointment_id` = ? WHERE `appointment_id` = ?',
        [d.parentAppointmentId, d.appointmentId]
      );
    }
  }

  // Children: appointment_services + appointment_service_ids
  let totalSvc = 0;
  let totalSvcIds = 0;
  for (const d of docs) {
    await pool.execute('DELETE FROM `appointment_services` WHERE `appointment_id` = ?', [d.appointmentId]);
    await pool.execute('DELETE FROM `appointment_service_ids` WHERE `appointment_id` = ?', [d.appointmentId]);

    const services = Array.isArray(d.services) ? d.services : [];
    for (const s of services) {
      await pool.execute(
        'INSERT INTO `appointment_services` (`appointment_id`,`service_id`,`name`,`price`) VALUES (?,?,?,?)',
        [d.appointmentId, s.serviceId || null, s.name || null, s.price ?? 0]
      );
      totalSvc++;
    }

    const svcIds = Array.isArray(d.serviceIds) ? d.serviceIds : [];
    for (const sid of svcIds) {
      if (!sid) continue;
      await pool.execute(
        'INSERT INTO `appointment_service_ids` (`appointment_id`,`service_id`) VALUES (?,?)',
        [d.appointmentId, sid]
      );
      totalSvcIds++;
    }
  }

  const ids = docs.map(d => d.appointmentId);
  const mysqlCount = await countMysqlMatched(pool, 'appointment', 'appointment_id', ids);
  const ok = docs.length === mysqlCount;
  await recordTable('appointment', { mongoCount: docs.length, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[appointment] mongo=${docs.length} mysql=${mysqlCount} ok=${ok}`);

  const svcMysql = await countChildren('appointment_services', 'appointment_id', ids);
  await recordTable('appointment_services', { mongoCount: totalSvc, mysqlCount: svcMysql, ok: totalSvc === svcMysql, lastRun: new Date().toISOString() });
  console.log(`[appointment_services] mongo=${totalSvc} mysql=${svcMysql} ok=${totalSvc === svcMysql}`);

  const svcIdsMysql = await countChildren('appointment_service_ids', 'appointment_id', ids);
  await recordTable('appointment_service_ids', { mongoCount: totalSvcIds, mysqlCount: svcIdsMysql, ok: totalSvcIds === svcIdsMysql, lastRun: new Date().toISOString() });
  console.log(`[appointment_service_ids] mongo=${totalSvcIds} mysql=${svcIdsMysql} ok=${totalSvcIds === svcIdsMysql}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
