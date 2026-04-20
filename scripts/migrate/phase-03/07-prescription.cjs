'use strict';
// 07-prescription.cjs — migrate `prescriptions` → `prescription` + 11 child tables
//
// Child tables (11):
//   prescription_vitals                   (Mixed vitals obj → 1 row per vital)
//   prescription_section_config           (Mixed sectionConfig obj → 1 row per section)
//   prescription_symptoms                 (symptoms[])
//   prescription_diagnoses                (diagnoses[])
//   prescription_examination_findings     (examinationFindings[])
//   prescription_medications              (medications[])
//   prescription_lab_investigations       (labInvestigations[])
//   prescription_lab_results              (labResults[])
//   prescription_procedures               (procedures[])
//   prescription_custom_sections          (customSections[])
//   prescription_custom_section_items     (customSections[].items[])
//
// followUp/referral/notes are scalar subdocs — flattened directly into the parent row.
// advice is a scalar string — goes into parent row.

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }        = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }              = require('../lib/state.cjs');
const { toTsStr, toBool, countMysqlMatched } = require('../lib/util.cjs');

async function countChildren(table, col, ids) {
  if (!ids || ids.length === 0) return 0;
  const CHUNK = 500;
  let total = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const ph = chunk.map(() => '?').join(', ');
    const [[{ c }]] = await pool.query(
      `SELECT COUNT(*) c FROM \`${table}\` WHERE \`${col}\` IN (${ph})`,
      chunk
    );
    total += Number(c);
  }
  return total;
}

// Vitals obj may be either flat ({ bp: "140/90", pulse: 82 }) or nested
// ({ bp: { value: "140/90", unit: "mmHg", is_locked: false } }).
// This returns { value_text, unit, is_locked } for a given vital value.
function normaliseVital(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && !Array.isArray(v)) {
    const raw = v.value ?? v.val ?? v.reading ?? null;
    return {
      value_text: raw === null || raw === undefined ? null : String(raw),
      unit:       v.unit || null,
      is_locked:  v.is_locked || v.isLocked ? 1 : 0,
    };
  }
  return {
    value_text: String(v),
    unit:       null,
    is_locked:  0,
  };
}

// sectionConfig may hold { sectionOrder:[...], enabledSections:{...}, printEnabledSections:{...} }
// We union the keys across all three maps and emit one row per section.
function normaliseSectionConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return [];
  const order   = Array.isArray(cfg.sectionOrder) ? cfg.sectionOrder : [];
  const enabled = (cfg.enabledSections && typeof cfg.enabledSections === 'object') ? cfg.enabledSections : {};
  const printed = (cfg.printEnabledSections && typeof cfg.printEnabledSections === 'object') ? cfg.printEnabledSections : {};
  const names = new Set([...order, ...Object.keys(enabled), ...Object.keys(printed)]);
  const rows = [];
  for (const name of names) {
    const idx = order.indexOf(name);
    rows.push({
      section_name:     String(name),
      sort_order:       idx === -1 ? 0 : idx,
      is_enabled:       Object.prototype.hasOwnProperty.call(enabled, name) ? (enabled[name] ? 1 : 0) : 1,
      is_print_enabled: Object.prototype.hasOwnProperty.call(printed, name) ? (printed[name] ? 1 : 0) : 1,
    });
  }
  return rows;
}

(async () => {
  const db   = await getDb();
  const docs = await db.collection('prescriptions').find({}).toArray();
  console.log(`[prescription] Mongo docs found: ${docs.length}`);

  // Tally child rows across all prescriptions
  let cVitals = 0, cSecCfg = 0, cSym = 0, cDiag = 0, cExam = 0, cMed = 0;
  let cLabInv = 0, cLabRes = 0, cProc = 0, cCustom = 0, cCustomItem = 0;

  for (const d of docs) {
    const rxId = d.prescriptionId;

    // --- Parent row ---
    const follow  = (d.followUp  && typeof d.followUp  === 'object') ? d.followUp  : {};
    const referral = (d.referral && typeof d.referral === 'object') ? d.referral : {};
    const notes    = (d.notes    && typeof d.notes    === 'object') ? d.notes    : {};

    const lang = (d.language === 'en' || d.language === 'hi' || d.language === 'mr') ? d.language : 'en';

    await upsert('prescription', {
      prescription_id:          rxId,
      organization_id:          d.organizationId,
      branch_id:                d.branchId,
      patient_id:               d.patientId,
      appointment_id:           d.appointmentId || null,
      queue_id:                 d.queueId       || null,
      doctor_id:                d.doctorId,
      visit_date:               toTsStr(d.visitDate) || toTsStr(d.createdAt),
      follow_up_date:           toTsStr(follow.date),
      follow_up_notes:          follow.notes || null,
      follow_up_notification:   toBool(follow.notificationEnabled ? 1 : 0),
      referral_doctor_name:     referral.doctorName || null,
      referral_specialty:       referral.specialty  || null,
      referral_reason:          referral.reason     || null,
      referral_notes:           referral.notes      || null,
      advice:                   d.advice || null,
      surgical_notes:           notes.surgicalNotes || null,
      private_notes:            notes.privateNotes  || null,
      language:                 lang,
      pdf_url:                  d.pdfUrl || null,
      is_edited:                toBool(d.isEdited ? 1 : 0),
      created_by:               d.createdBy || null,
      created_at:               toTsStr(d.createdAt),
      updated_at:               toTsStr(d.updatedAt),
    }, 'prescription_id');

    // --- Clear children (idempotency) ---
    const childTables = [
      'prescription_vitals',
      'prescription_section_config',
      'prescription_symptoms',
      'prescription_diagnoses',
      'prescription_examination_findings',
      'prescription_medications',
      'prescription_lab_investigations',
      'prescription_lab_results',
      'prescription_procedures',
      // prescription_custom_section_items deletes via FK cascade when sections go
      'prescription_custom_sections',
    ];
    for (const t of childTables) {
      await pool.execute(`DELETE FROM \`${t}\` WHERE \`prescription_id\` = ?`, [rxId]);
    }

    // --- Vitals ---
    const vitalsObj = (d.vitals && typeof d.vitals === 'object') ? d.vitals : {};
    for (const [name, raw] of Object.entries(vitalsObj)) {
      const n = normaliseVital(raw);
      if (!n) continue;
      await pool.execute(
        'INSERT INTO `prescription_vitals` (`prescription_id`,`vital_name`,`value_text`,`unit`,`is_locked`) VALUES (?,?,?,?,?)',
        [rxId, String(name).slice(0, 50), n.value_text, n.unit, n.is_locked]
      );
      cVitals++;
    }

    // --- Section config ---
    const cfgRows = normaliseSectionConfig(d.sectionConfig);
    for (const r of cfgRows) {
      await pool.execute(
        'INSERT INTO `prescription_section_config` (`prescription_id`,`section_name`,`sort_order`,`is_enabled`,`is_print_enabled`) VALUES (?,?,?,?,?)',
        [rxId, r.section_name.slice(0, 50), r.sort_order, r.is_enabled, r.is_print_enabled]
      );
      cSecCfg++;
    }

    // --- Symptoms ---
    const symptoms = Array.isArray(d.symptoms) ? d.symptoms : [];
    for (let i = 0; i < symptoms.length; i++) {
      const s = symptoms[i] || {};
      await pool.execute(
        'INSERT INTO `prescription_symptoms` (`prescription_id`,`name`,`severity`,`duration`,`laterality`,`additional_info`,`sort_order`) VALUES (?,?,?,?,?,?,?)',
        [rxId, s.name || '', s.severity || null, s.duration || null, s.laterality || null, s.additionalInfo || null, i]
      );
      cSym++;
    }

    // --- Diagnoses ---
    const diagnoses = Array.isArray(d.diagnoses) ? d.diagnoses : [];
    for (let i = 0; i < diagnoses.length; i++) {
      const x = diagnoses[i] || {};
      await pool.execute(
        'INSERT INTO `prescription_diagnoses` (`prescription_id`,`icd_code`,`description`,`type`,`status`,`since`,`notes`,`sort_order`) VALUES (?,?,?,?,?,?,?,?)',
        [rxId, x.icdCode || null, x.description || null, x.type || null, x.status || null, x.since || null, x.notes || null, i]
      );
      cDiag++;
    }

    // --- Examination findings ---
    const exams = Array.isArray(d.examinationFindings) ? d.examinationFindings : [];
    for (let i = 0; i < exams.length; i++) {
      const e = exams[i] || {};
      await pool.execute(
        'INSERT INTO `prescription_examination_findings` (`prescription_id`,`name`,`notes`,`sort_order`) VALUES (?,?,?,?)',
        [rxId, e.name || '', e.notes || null, i]
      );
      cExam++;
    }

    // --- Medications ---
    const meds = Array.isArray(d.medications) ? d.medications : [];
    for (let i = 0; i < meds.length; i++) {
      const m = meds[i] || {};
      await pool.execute(
        'INSERT INTO `prescription_medications` (`prescription_id`,`brand_name`,`generic_name`,`form`,`dosage`,`frequency`,`timing`,`duration`,`start_date_condition`,`quantity`,`instructions`,`is_tapering`,`sort_order`) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [rxId, m.brandName || null, m.genericName || null, m.form || null, m.dosage || null, m.frequency || null, m.timing || null, m.duration || null, m.startDateCondition || null, m.quantity || null, m.instructions || null, m.isTapering ? 1 : 0, i]
      );
      cMed++;
    }

    // --- Lab investigations ---
    const labInv = Array.isArray(d.labInvestigations) ? d.labInvestigations : [];
    for (let i = 0; i < labInv.length; i++) {
      const l = labInv[i] || {};
      await pool.execute(
        'INSERT INTO `prescription_lab_investigations` (`prescription_id`,`test_name`,`category`,`test_on`,`repeat_on`,`remarks`,`urgent`,`sort_order`) VALUES (?,?,?,?,?,?,?,?)',
        [rxId, l.testName || null, l.category || null, toTsStr(l.testOn), toTsStr(l.repeatOn), l.remarks || null, l.urgent ? 1 : 0, i]
      );
      cLabInv++;
    }

    // --- Lab results ---
    const labRes = Array.isArray(d.labResults) ? d.labResults : [];
    for (let i = 0; i < labRes.length; i++) {
      const r = labRes[i] || {};
      await pool.execute(
        'INSERT INTO `prescription_lab_results` (`prescription_id`,`test_name`,`reading`,`unit`,`normal_range`,`interpretation`,`result_date`,`notes`,`sort_order`) VALUES (?,?,?,?,?,?,?,?,?)',
        [rxId, r.testName || null, r.reading || null, r.unit || null, r.normalRange || null, r.interpretation || null, toTsStr(r.date), r.notes || null, i]
      );
      cLabRes++;
    }

    // --- Procedures ---
    const procs = Array.isArray(d.procedures) ? d.procedures : [];
    for (let i = 0; i < procs.length; i++) {
      const p = procs[i] || {};
      await pool.execute(
        'INSERT INTO `prescription_procedures` (`prescription_id`,`name`,`procedure_date`,`notes`,`sort_order`) VALUES (?,?,?,?,?)',
        [rxId, p.name || null, toTsStr(p.date), p.notes || null, i]
      );
      cProc++;
    }

    // --- Custom sections + items ---
    const custom = Array.isArray(d.customSections) ? d.customSections : [];
    for (let i = 0; i < custom.length; i++) {
      const sec = custom[i] || {};
      const [ins] = await pool.execute(
        'INSERT INTO `prescription_custom_sections` (`prescription_id`,`section_id`,`title`,`sort_order`) VALUES (?,?,?,?)',
        [rxId, sec.id || null, sec.title || null, i]
      );
      cCustom++;
      const customSectionPk = ins.insertId;
      const items = Array.isArray(sec.items) ? sec.items : [];
      for (let j = 0; j < items.length; j++) {
        const it = items[j] || {};
        await pool.execute(
          'INSERT INTO `prescription_custom_section_items` (`custom_section_id`,`item_key`,`item_value`,`sort_order`) VALUES (?,?,?,?)',
          [customSectionPk, it.key || null, it.value || null, j]
        );
        cCustomItem++;
      }
    }
  }

  // --- Verification: record counts for parent + all 11 child tables ---
  const ids = docs.map(d => d.prescriptionId);
  const ts = () => new Date().toISOString();

  const rxMysql = await countMysqlMatched(pool, 'prescription', 'prescription_id', ids);
  const okParent = docs.length === rxMysql;
  await recordTable('prescription', { mongoCount: docs.length, mysqlCount: rxMysql, ok: okParent, lastRun: ts() });
  console.log(`[prescription] mongo=${docs.length} mysql=${rxMysql} ok=${okParent}`);

  const childPairs = [
    ['prescription_vitals',               cVitals],
    ['prescription_section_config',       cSecCfg],
    ['prescription_symptoms',             cSym],
    ['prescription_diagnoses',            cDiag],
    ['prescription_examination_findings', cExam],
    ['prescription_medications',          cMed],
    ['prescription_lab_investigations',   cLabInv],
    ['prescription_lab_results',          cLabRes],
    ['prescription_procedures',           cProc],
    ['prescription_custom_sections',      cCustom],
  ];
  let allOk = okParent;
  for (const [table, expected] of childPairs) {
    const actual = await countChildren(table, 'prescription_id', ids);
    const ok = expected === actual;
    if (!ok) allOk = false;
    await recordTable(table, { mongoCount: expected, mysqlCount: actual, ok, lastRun: ts() });
    console.log(`[${table}] mongo=${expected} mysql=${actual} ok=${ok}`);
  }

  // prescription_custom_section_items is keyed by custom_section_id (int PK), not prescription_id
  const [[{ c: itemCountMysql }]] = await pool.query(
    `SELECT COUNT(*) c FROM \`prescription_custom_section_items\` i
       JOIN \`prescription_custom_sections\` s ON s.id = i.custom_section_id
      WHERE s.prescription_id IN (${ids.length ? ids.map(() => '?').join(',') : 'NULL'})`,
    ids
  );
  const okItems = cCustomItem === Number(itemCountMysql);
  if (!okItems) allOk = false;
  await recordTable('prescription_custom_section_items', { mongoCount: cCustomItem, mysqlCount: Number(itemCountMysql), ok: okItems, lastRun: ts() });
  console.log(`[prescription_custom_section_items] mongo=${cCustomItem} mysql=${itemCountMysql} ok=${okItems}`);

  await closeMongo();
  await closeMysql();
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
