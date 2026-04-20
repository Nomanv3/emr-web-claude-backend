'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }        = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }              = require('../lib/state.cjs');
const { toBool, toTsStr, countMysqlMatched } = require('../lib/util.cjs');

(async () => {
  const db   = await getDb();
  const docs  = await db.collection('patientmedicalhistories').find({}).toArray();
  console.log(`[patient_medical_history] Mongo docs found: ${docs.length}`);

  let totalConditions  = 0;
  let totalAllergies   = 0;
  let totalSurgical    = 0;
  let totalFamily      = 0;

  for (const d of docs) {
    const historyId = d.historyId;

    // Parent row
    await upsert('patient_medical_history', {
      history_id:  historyId,
      patient_id:  d.patientId,
      no_history:  toBool(d.noHistory),
      updated_by:  d.updatedBy  || null,
      created_at:  toTsStr(d.createdAt),
      updated_at:  toTsStr(d.updatedAt),
    }, 'history_id');

    // ---- patient_medical_conditions ----
    const conditions = Array.isArray(d.conditions) ? d.conditions : [];
    await pool.execute('DELETE FROM `patient_medical_conditions` WHERE `history_id` = ?', [historyId]);
    for (const c of conditions) {
      if (!c || !c.name) continue;
      await pool.execute(
        'INSERT INTO `patient_medical_conditions` (`history_id`, `name`, `value`, `since`, `notes`) VALUES (?, ?, ?, ?, ?)',
        [historyId, c.name, c.value || '-', c.since || null, c.notes || null]
      );
      totalConditions++;
    }

    // ---- patient_allergies ----
    const allergies = Array.isArray(d.allergies) ? d.allergies : [];
    await pool.execute('DELETE FROM `patient_allergies` WHERE `history_id` = ?', [historyId]);
    for (const a of allergies) {
      if (!a || !a.allergen) continue;
      await pool.execute(
        'INSERT INTO `patient_allergies` (`history_id`, `allergen`, `severity`, `reaction`) VALUES (?, ?, ?, ?)',
        [historyId, a.allergen, a.severity || null, a.reaction || null]
      );
      totalAllergies++;
    }

    // ---- patient_surgical_history ----
    const surgicalHistory = Array.isArray(d.surgicalHistory) ? d.surgicalHistory : [];
    await pool.execute('DELETE FROM `patient_surgical_history` WHERE `history_id` = ?', [historyId]);
    for (const s of surgicalHistory) {
      if (!s || !s.procedure) continue;
      // `procedure` is a MySQL reserved word → use `procedure_name` column
      let procDate = null;
      if (s.date) {
        const dt = new Date(s.date);
        if (!isNaN(dt.getTime())) procDate = dt.toISOString().slice(0, 10);
      }
      await pool.execute(
        'INSERT INTO `patient_surgical_history` (`history_id`, `procedure_name`, `procedure_date`, `notes`) VALUES (?, ?, ?, ?)',
        [historyId, s.procedure, procDate, s.notes || null]
      );
      totalSurgical++;
    }

    // ---- patient_family_history ----
    const familyHistory = Array.isArray(d.familyHistory) ? d.familyHistory : [];
    await pool.execute('DELETE FROM `patient_family_history` WHERE `history_id` = ?', [historyId]);
    for (const f of familyHistory) {
      if (!f || !f.relation) continue;
      // `condition` is a MySQL reserved word → use `condition_desc` column (see db.sql)
      await pool.execute(
        'INSERT INTO `patient_family_history` (`history_id`, `relation`, `condition_desc`) VALUES (?, ?, ?)',
        [historyId, f.relation, f.condition || '']
      );
      totalFamily++;
    }
  }

  // Count checks
  const mongoCount = docs.length;
  const ids = docs.map(d => d.historyId);
  const mysqlCount = await countMysqlMatched(pool, 'patient_medical_history', 'history_id', ids);
  const ok = mongoCount === mysqlCount;
  await recordTable('patient_medical_history', { mongoCount, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[patient_medical_history] mongo=${mongoCount} mysql=${mysqlCount} ok=${ok}`);

  // Children count checks
  async function countChildRows(table, col, parentIds) {
    if (!parentIds || parentIds.length === 0) return 0;
    const ph = parentIds.map(() => '?').join(', ');
    const [[{ c }]] = await pool.query(`SELECT COUNT(*) c FROM \`${table}\` WHERE \`${col}\` IN (${ph})`, parentIds);
    return Number(c);
  }

  const mysqlConditions = await countChildRows('patient_medical_conditions', 'history_id', ids);
  const mysqlAllergies  = await countChildRows('patient_allergies',          'history_id', ids);
  const mysqlSurgical   = await countChildRows('patient_surgical_history',   'history_id', ids);
  const mysqlFamily     = await countChildRows('patient_family_history',     'history_id', ids);

  const now = new Date().toISOString();
  await recordTable('patient_medical_conditions', { mongoCount: totalConditions, mysqlCount: mysqlConditions, ok: totalConditions === mysqlConditions, lastRun: now });
  await recordTable('patient_allergies',          { mongoCount: totalAllergies,  mysqlCount: mysqlAllergies,  ok: totalAllergies  === mysqlAllergies,  lastRun: now });
  await recordTable('patient_surgical_history',   { mongoCount: totalSurgical,   mysqlCount: mysqlSurgical,   ok: totalSurgical   === mysqlSurgical,   lastRun: now });
  await recordTable('patient_family_history',     { mongoCount: totalFamily,     mysqlCount: mysqlFamily,     ok: totalFamily     === mysqlFamily,     lastRun: now });

  console.log(`[patient_medical_conditions] mongo=${totalConditions} mysql=${mysqlConditions} ok=${totalConditions === mysqlConditions}`);
  console.log(`[patient_allergies]          mongo=${totalAllergies}  mysql=${mysqlAllergies}  ok=${totalAllergies  === mysqlAllergies}`);
  console.log(`[patient_surgical_history]   mongo=${totalSurgical}   mysql=${mysqlSurgical}   ok=${totalSurgical   === mysqlSurgical}`);
  console.log(`[patient_family_history]     mongo=${totalFamily}     mysql=${mysqlFamily}     ok=${totalFamily     === mysqlFamily}`);

  const allOk = ok
    && totalConditions === mysqlConditions
    && totalAllergies  === mysqlAllergies
    && totalSurgical   === mysqlSurgical
    && totalFamily     === mysqlFamily;

  await closeMongo();
  await closeMysql();
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
