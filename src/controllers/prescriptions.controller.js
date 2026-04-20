import { query, withTransaction } from '../config/mysql.js';
import { v4 as uuidv4 } from 'uuid';
import { mapPrescriptionRow } from '../db/mappers/prescription.mapper.js';
import { mapPatientRow } from '../db/mappers/patient.mapper.js';
import { mapPatientHistoryRow } from '../db/mappers/patientHistory.mapper.js';
import { upsertMedicalHistoryMysql } from './patients.controller.js';

// ─── Input normalisation helpers ─────────────────────────────────────────────
// Frontend sends either Mongoose-shaped nested objects (followUp.date) or flat
// fields (followUpDate). Normalise to the flat form used by SQL.
function normaliseFollowUp(body) {
  const fu = body.followUp || (Array.isArray(body.followUps) ? body.followUps[0] : null) || {};
  return {
    date:   body.followUpDate ?? fu.date ?? null,
    notes:  body.followUpNotes ?? fu.notes ?? null,
    notify: (body.followUpNotification ?? fu.notificationEnabled ?? false) ? 1 : 0,
  };
}
function normaliseReferral(body) {
  const r = body.referral || (Array.isArray(body.referToDoctor) ? body.referToDoctor[0] : null) || {};
  return {
    doctorName: body.referralDoctorName ?? r.doctorName ?? null,
    specialty:  body.referralSpecialty  ?? r.specialty  ?? null,
    reason:     body.referralReason     ?? r.reason     ?? null,
    notes:      body.referralNotes      ?? r.notes      ?? null,
  };
}
function normaliseNotes(body) {
  const n = body.notes && typeof body.notes === 'object' ? body.notes : {};
  return {
    surgical: body.surgicalNotes ?? n.surgicalNotes ?? null,
    private:  body.privateNotes  ?? n.privateNotes  ?? null,
  };
}
function normaliseAdvice(body) {
  if (Array.isArray(body.advices)) return body.advices.join('\n');
  return body.advice ?? null;
}
function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Child-table write helpers (all take a live conn from withTransaction) ───

async function insertVitals(conn, prescriptionId, vitals) {
  if (!vitals || typeof vitals !== 'object') return;
  for (const [name, raw] of Object.entries(vitals)) {
    if (raw == null || raw === '') continue;
    let valueText = null, unit = null, isLocked = 0;
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      valueText = raw.value != null ? String(raw.value) : null;
      unit      = raw.unit || null;
      isLocked  = raw.is_locked || raw.isLocked ? 1 : 0;
    } else {
      valueText = String(raw);
    }
    if (valueText == null || valueText === '') continue;
    await conn.query(
      `INSERT INTO prescription_vitals (prescription_id, vital_name, value_text, unit, is_locked)
       VALUES (?, ?, ?, ?, ?)`,
      [prescriptionId, name, valueText, unit, isLocked],
    );
  }
}

async function insertSectionConfig(conn, prescriptionId, sectionConfig) {
  if (!sectionConfig || typeof sectionConfig !== 'object') return;
  const order = Array.isArray(sectionConfig.sectionOrder) ? sectionConfig.sectionOrder : [];
  const enabled = sectionConfig.enabledSections || {};
  const printEnabled = sectionConfig.printEnabledSections || {};
  const names = new Set([...order, ...Object.keys(enabled), ...Object.keys(printEnabled)]);
  let i = 0;
  for (const name of names) {
    const sort = order.indexOf(name);
    await conn.query(
      `INSERT INTO prescription_section_config (prescription_id, section_name, sort_order, is_enabled, is_print_enabled)
       VALUES (?, ?, ?, ?, ?)`,
      [
        prescriptionId,
        name,
        sort >= 0 ? sort : 1000 + i++,
        enabled[name] === false ? 0 : 1,
        printEnabled[name] === false ? 0 : 1,
      ],
    );
  }
}

async function insertSymptoms(conn, prescriptionId, arr) {
  if (!Array.isArray(arr)) return;
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i] || {};
    await conn.query(
      `INSERT INTO prescription_symptoms (prescription_id, name, severity, duration, laterality, additional_info, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [prescriptionId, s.name || '', s.severity || null, s.duration || null, s.laterality || null, s.additionalInfo || null, i],
    );
  }
}

async function insertDiagnoses(conn, prescriptionId, arr) {
  if (!Array.isArray(arr)) return;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] || {};
    await conn.query(
      `INSERT INTO prescription_diagnoses (prescription_id, icd_code, description, type, status, since, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [prescriptionId, d.icdCode || null, d.description || null, d.type || null, d.status || null, d.since || null, d.notes || null, i],
    );
  }
}

async function insertExaminations(conn, prescriptionId, arr) {
  if (!Array.isArray(arr)) return;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i] || {};
    await conn.query(
      `INSERT INTO prescription_examination_findings (prescription_id, name, notes, sort_order)
       VALUES (?, ?, ?, ?)`,
      [prescriptionId, e.name || '', e.notes || null, i],
    );
  }
}

async function insertMedications(conn, prescriptionId, arr) {
  if (!Array.isArray(arr)) return;
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i] || {};
    await conn.query(
      `INSERT INTO prescription_medications
       (prescription_id, brand_name, generic_name, form, dosage, frequency, timing, duration,
        start_date_condition, quantity, instructions, is_tapering, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        prescriptionId,
        m.brandName || null, m.genericName || null, m.form || null,
        m.dosage || null, m.frequency || null, m.timing || null, m.duration || null,
        m.startDateCondition || null, m.quantity || null, m.instructions || null,
        m.isTapering ? 1 : 0, i,
      ],
    );
  }
}

async function insertLabInvestigations(conn, prescriptionId, arr) {
  if (!Array.isArray(arr)) return;
  for (let i = 0; i < arr.length; i++) {
    const l = arr[i] || {};
    await conn.query(
      `INSERT INTO prescription_lab_investigations
       (prescription_id, test_name, category, test_on, repeat_on, remarks, urgent, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [prescriptionId, l.testName || null, l.category || null, toDate(l.testOn), toDate(l.repeatOn), l.remarks || null, l.urgent ? 1 : 0, i],
    );
  }
}

async function insertLabResults(conn, prescriptionId, arr) {
  if (!Array.isArray(arr)) return;
  for (let i = 0; i < arr.length; i++) {
    const l = arr[i] || {};
    await conn.query(
      `INSERT INTO prescription_lab_results
       (prescription_id, test_name, reading, unit, normal_range, interpretation, result_date, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        prescriptionId, l.testName || null, l.reading || null, l.unit || null,
        l.normalRange || null, l.interpretation || null,
        toDate(l.resultDate ?? l.date), l.notes || null, i,
      ],
    );
  }
}

async function insertProcedures(conn, prescriptionId, arr) {
  if (!Array.isArray(arr)) return;
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i] || {};
    await conn.query(
      `INSERT INTO prescription_procedures (prescription_id, name, procedure_date, notes, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [prescriptionId, p.name || null, toDate(p.procedureDate ?? p.date), p.notes || null, i],
    );
  }
}

async function insertCustomSections(conn, prescriptionId, arr) {
  if (!Array.isArray(arr)) return;
  for (let i = 0; i < arr.length; i++) {
    const cs = arr[i] || {};
    const sectionId = cs.sectionId || cs.id || null;
    const [result] = await conn.query(
      `INSERT INTO prescription_custom_sections (prescription_id, section_id, title, sort_order)
       VALUES (?, ?, ?, ?)`,
      [prescriptionId, sectionId, cs.title || null, i],
    );
    const customSectionPk = result.insertId;
    const items = Array.isArray(cs.items) ? cs.items : [];
    for (let j = 0; j < items.length; j++) {
      const it = items[j] || {};
      await conn.query(
        `INSERT INTO prescription_custom_section_items (custom_section_id, item_key, item_value, sort_order)
         VALUES (?, ?, ?, ?)`,
        [customSectionPk, it.key || null, it.value || null, j],
      );
    }
  }
}

async function deleteAllPrescriptionChildren(conn, prescriptionId) {
  // Order doesn't matter — all CASCADE on prescription_id except custom_section_items (cascades via parent).
  await conn.query('DELETE FROM prescription_vitals WHERE prescription_id = ?', [prescriptionId]);
  await conn.query('DELETE FROM prescription_section_config WHERE prescription_id = ?', [prescriptionId]);
  await conn.query('DELETE FROM prescription_symptoms WHERE prescription_id = ?', [prescriptionId]);
  await conn.query('DELETE FROM prescription_diagnoses WHERE prescription_id = ?', [prescriptionId]);
  await conn.query('DELETE FROM prescription_examination_findings WHERE prescription_id = ?', [prescriptionId]);
  await conn.query('DELETE FROM prescription_medications WHERE prescription_id = ?', [prescriptionId]);
  await conn.query('DELETE FROM prescription_lab_investigations WHERE prescription_id = ?', [prescriptionId]);
  await conn.query('DELETE FROM prescription_lab_results WHERE prescription_id = ?', [prescriptionId]);
  await conn.query('DELETE FROM prescription_procedures WHERE prescription_id = ?', [prescriptionId]);
  await conn.query('DELETE FROM prescription_custom_sections WHERE prescription_id = ?', [prescriptionId]);
}

async function insertAllPrescriptionChildren(conn, prescriptionId, body) {
  await insertVitals(conn, prescriptionId, body.vitals);
  await insertSectionConfig(conn, prescriptionId, body.sectionConfig);
  await insertSymptoms(conn, prescriptionId, body.symptoms);
  await insertDiagnoses(conn, prescriptionId, body.diagnoses);
  await insertExaminations(conn, prescriptionId, body.examinationFindings ?? body.examination_findings);
  await insertMedications(conn, prescriptionId, body.medications ?? body.medication);
  await insertLabInvestigations(conn, prescriptionId, body.labInvestigations ?? body.LabInv);
  await insertLabResults(conn, prescriptionId, body.labResults);
  await insertProcedures(conn, prescriptionId, body.procedures);
  await insertCustomSections(conn, prescriptionId, body.customSections);
}

// ─── Save Prescription ───────────────────────────────────────────────────────
export const savePrescription = async (req, res, next) => {
  try {
    const orgId    = req.body.organization_id || req.body.organizationId;
    const branchId = req.body.branch_id || req.body.branchId;
    const patientId = req.body.patient_id || req.body.patientId;
    const doctorId  = req.body.doctor_id || req.body.doctorId || req.user?.userId;
    const apptId    = req.body.appointment_id || req.body.appointmentId || null;
    const queueId   = req.body.queue_id || req.body.queueId || null;
    const createdBy = req.body.created_by || req.user?.userId || null;

    const followUp = normaliseFollowUp(req.body);
    const referral = normaliseReferral(req.body);
    const notes    = normaliseNotes(req.body);
    const advice   = normaliseAdvice(req.body);
    const language = req.body.language || 'en';
    const visitDate = toDate(req.body.visitDate) || new Date();

    const prescriptionId = uuidv4();

    const out = await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO prescription
         (prescription_id, organization_id, branch_id, patient_id, appointment_id, queue_id, doctor_id,
          visit_date, follow_up_date, follow_up_notes, follow_up_notification,
          referral_doctor_name, referral_specialty, referral_reason, referral_notes,
          advice, surgical_notes, private_notes, language, pdf_url, is_edited, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          prescriptionId, orgId, branchId, patientId, apptId, queueId, doctorId,
          visitDate, toDate(followUp.date), followUp.notes, followUp.notify,
          referral.doctorName, referral.specialty, referral.reason, referral.notes,
          advice, notes.surgical, notes.private, language, req.body.pdfUrl || null, createdBy,
        ],
      );

      await insertAllPrescriptionChildren(conn, prescriptionId, req.body);

      // Upsert medical history if provided.
      const medConditions = req.body.medicalConditions;
      if (patientId && Array.isArray(medConditions) && medConditions.length > 0) {
        const history = {
          conditions: medConditions.map((c) => ({
            name: c.name, value: c.value, since: c.since || '', notes: c.notes || '',
          })),
          noHistory: !!req.body.noRelevantHistory,
        };
        await upsertMedicalHistoryMysql(conn, patientId, history, createdBy);
      }

      if (queueId) {
        await conn.query(
          `UPDATE queue SET status = 'Completed' WHERE queue_id = ?`,
          [queueId],
        );
      }

      return { prescriptionId, pdfUrl: req.body.pdfUrl || null };
    });

    return res.status(201).json({
      success: true,
      data: out,
      message: 'Prescription saved successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ─── Update Prescription ─────────────────────────────────────────────────────
export const updatePrescription = async (req, res, next) => {
  try {
    const prescriptionId = req.body.prescription_id || req.body.prescriptionId;
    if (!prescriptionId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'prescription_id is required' },
      });
    }

    const followUp = normaliseFollowUp(req.body);
    const referral = normaliseReferral(req.body);
    const notes    = normaliseNotes(req.body);
    const advice   = normaliseAdvice(req.body);

    const result = await withTransaction(async (conn) => {
      const [exists] = await conn.query(
        'SELECT prescription_id, patient_id FROM prescription WHERE prescription_id = ? LIMIT 1',
        [prescriptionId],
      );
      if (!exists.length) {
        const err = new Error('NOT_FOUND');
        err.code = 'PRESCRIPTION_NOT_FOUND';
        throw err;
      }
      const patientId = exists[0].patient_id;

      const sets = [];
      const params = [];
      const setIf = (col, val) => {
        if (val !== undefined) { sets.push(`${col} = ?`); params.push(val); }
      };
      setIf('follow_up_date', toDate(followUp.date));
      setIf('follow_up_notes', followUp.notes);
      setIf('follow_up_notification', followUp.notify);
      setIf('referral_doctor_name', referral.doctorName);
      setIf('referral_specialty', referral.specialty);
      setIf('referral_reason', referral.reason);
      setIf('referral_notes', referral.notes);
      if (advice !== null || req.body.advice !== undefined || Array.isArray(req.body.advices)) {
        sets.push('advice = ?'); params.push(advice);
      }
      setIf('surgical_notes', notes.surgical);
      setIf('private_notes', notes.private);
      if (req.body.language !== undefined) { sets.push('language = ?'); params.push(req.body.language); }
      if (req.body.pdfUrl !== undefined)   { sets.push('pdf_url = ?');  params.push(req.body.pdfUrl); }
      sets.push('is_edited = 1');

      params.push(prescriptionId);
      await conn.query(
        `UPDATE prescription SET ${sets.join(', ')} WHERE prescription_id = ?`,
        params,
      );

      // Replace children that were supplied (DELETE+INSERT semantics).
      await deleteAllPrescriptionChildren(conn, prescriptionId);
      await insertAllPrescriptionChildren(conn, prescriptionId, req.body);

      const medConditions = req.body.medicalConditions;
      if (patientId && Array.isArray(medConditions) && medConditions.length > 0) {
        const history = {
          conditions: medConditions.map((c) => ({
            name: c.name, value: c.value, since: c.since || '', notes: c.notes || '',
          })),
          noHistory: !!req.body.noRelevantHistory,
        };
        await upsertMedicalHistoryMysql(conn, patientId, history, req.user?.userId || null);
      }

      return patientId;
    }).catch((e) => {
      if (e?.code === 'PRESCRIPTION_NOT_FOUND') return { notFound: true };
      throw e;
    });

    if (result && result.notFound) {
      return res.status(404).json({
        success: false,
        error: { code: 'PRESCRIPTION_NOT_FOUND', message: 'Prescription not found' },
      });
    }

    const [rows] = await query('SELECT * FROM prescription WHERE prescription_id = ? LIMIT 1', [prescriptionId]);
    const data = await mapPrescriptionRow(rows[0]);

    return res.json({
      success: true,
      data,
      message: 'Prescription updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ─── Get Full Prescription ───────────────────────────────────────────────────
export const getFullPrescription = async (req, res, next) => {
  try {
    const prescriptionId = req.query.prescription_id || req.query.prescriptionId;
    if (!prescriptionId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'prescription_id is required' },
      });
    }

    const [rows] = await query(
      'SELECT * FROM prescription WHERE prescription_id = ? AND deleted_at IS NULL LIMIT 1',
      [prescriptionId],
    );
    if (!rows.length) {
      return res.status(404).json({
        success: false,
        error: { code: 'PRESCRIPTION_NOT_FOUND', message: 'Prescription not found' },
      });
    }
    const data = await mapPrescriptionRow(rows[0]);
    return res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ─── Get Patient Prescriptions ───────────────────────────────────────────────
export const getPatientPrescriptions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, startDate, endDate } = req.query;
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);

    const where = ['patient_id = ?', 'deleted_at IS NULL'];
    const params = [req.params.patientId];
    if (startDate) { where.push('visit_date >= ?'); params.push(new Date(startDate)); }
    if (endDate)   { where.push('visit_date <= ?'); params.push(new Date(endDate)); }

    const offset = (parsedPage - 1) * parsedLimit;
    const [rows] = await query(
      `SELECT * FROM prescription WHERE ${where.join(' AND ')}
       ORDER BY visit_date DESC LIMIT ${parsedLimit} OFFSET ${offset}`,
      params,
    );
    const [countRows] = await query(
      `SELECT COUNT(*) AS c FROM prescription WHERE ${where.join(' AND ')}`,
      params,
    );
    const total = countRows[0]?.c || 0;
    const data = await Promise.all(rows.map((r) => mapPrescriptionRow(r)));

    return res.json({
      success: true,
      data,
      pagination: { page: parsedPage, limit: parsedLimit, total, totalPages: Math.ceil(total / parsedLimit) },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Dropdown Options ────────────────────────────────────────────────────────
export const getDropdownOptions = async (req, res, next) => {
  try {
    const [rows] = await query(
      `SELECT dropdown_option_id, section, option_key, option_value, translation_hi, translation_mr
       FROM dropdown_option WHERE is_active = 1 ORDER BY sort_order, id`,
    );
    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.section]) grouped[r.section] = {};
      if (!grouped[r.section][r.option_key]) grouped[r.section][r.option_key] = [];
      grouped[r.section][r.option_key].push({
        dropdown_option_id: r.dropdown_option_id,
        option_value: r.option_value,
        option_key: r.option_key,
        translations: { hi: r.translation_hi || '', mr: r.translation_mr || '' },
      });
    }
    return res.json({ success: true, data: grouped });
  } catch (error) {
    next(error);
  }
};

// ─── Unified Search ──────────────────────────────────────────────────────────
// Maps category → {table, nameCol, idCol, pickCols} for MySQL search.
const CATEGORY_SQL_MAP = {
  symptoms:             { table: 'master_symptom',            nameCol: 'name',        idCol: 'symptom_id',   idKey: 'symptomId' },
  diagnoses:            { table: 'master_diagnosis',          nameCol: 'description', idCol: 'diagnosis_id', idKey: 'diagnosisId' },
  medications:          { table: 'master_medication',         nameCol: 'brand_name',  idCol: 'medication_id', idKey: 'medicationId' },
  lab_investigations:   { table: 'master_lab_test',           nameCol: 'name',        idCol: 'test_id',      idKey: 'testId' },
  labtests:             { table: 'master_lab_test',           nameCol: 'name',        idCol: 'test_id',      idKey: 'testId' },
  labresults:           { table: 'master_lab_test',           nameCol: 'name',        idCol: 'test_id',      idKey: 'testId' },
  examination_findings: { table: 'master_examination_finding', nameCol: 'name',       idCol: 'finding_id',   idKey: 'findingId' },
  procedures:           { table: 'master_procedure',          nameCol: 'name',        idCol: 'procedure_id', idKey: 'procedureId' },
};

function mapMasterRow(category, r) {
  const cfg = CATEGORY_SQL_MAP[category];
  // Return camelCase + original ID field name the frontend expects for each category.
  const base = {
    _id: r[cfg.idCol],
    [cfg.idKey]: r[cfg.idCol],
    organizationId: r.organization_id || null,
    branchId: r.branch_id || null,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
  if (category === 'symptoms') {
    return { ...base, name: r.name, category: r.category || null, icdMapping: r.icd_mapping || null };
  }
  if (category === 'diagnoses') {
    return { ...base, icdCode: r.icd_code, description: r.description, category: r.category || null };
  }
  if (category === 'medications') {
    return { ...base, brandName: r.brand_name, genericName: r.generic_name || null, form: r.form || null, strength: r.strength || null, manufacturer: r.manufacturer || null };
  }
  if (category === 'lab_investigations' || category === 'labtests' || category === 'labresults') {
    return { ...base, name: r.name, category: r.category || null, normalRange: r.normal_range || null, unit: r.unit || null };
  }
  if (category === 'examination_findings') {
    return { ...base, name: r.name, category: r.category || null };
  }
  if (category === 'procedures') {
    return { ...base, name: r.name, category: r.category || null };
  }
  return base;
}

export const searchPrescriptionItems = async (req, res, next) => {
  try {
    const { search = '', category = 'symptoms', limit: qLimit = '6', offset: qOffset = '0' } = req.query;
    const limit = parseInt(qLimit);
    const offset = parseInt(qOffset);

    const cfg = CATEGORY_SQL_MAP[category];
    if (!cfg) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CATEGORY', message: `Invalid category: ${category}` },
      });
    }
    const params = [];
    let where = '';
    if (search) {
      where = `WHERE ${cfg.nameCol} LIKE ?`;
      params.push(`%${search}%`);
    }
    const [items] = await query(
      `SELECT * FROM ${cfg.table} ${where} ORDER BY id LIMIT ${limit + 1} OFFSET ${offset}`,
      params,
    );
    const [countRows] = await query(
      `SELECT COUNT(*) AS c FROM ${cfg.table} ${where}`,
      params,
    );
    const total = countRows[0]?.c || 0;
    const hasMore = items.length > limit;
    const data = (hasMore ? items.slice(0, limit) : items).map((r) => mapMasterRow(category, r));

    return res.json({
      success: true,
      data,
      has_more: hasMore,
      next_offset: hasMore ? offset + limit : null,
      total,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Frequently Seen ─────────────────────────────────────────────────────────
const CATEGORY_FIELD_MAP = {
  symptoms: 'symptoms',
  diagnoses: 'diagnoses',
  medications: 'medications',
  lab_investigations: 'labInvestigations',
  labtests: 'labInvestigations',
  labresults: 'labResults',
  examination_findings: 'examinationFindings',
  procedures: 'procedures',
};
const CATEGORY_NAME_FIELD = {
  symptoms: 'name',
  diagnoses: 'description',
  medications: 'brandName',
  lab_investigations: 'testName',
  labtests: 'testName',
  labresults: 'testName',
  examination_findings: 'name',
  procedures: 'name',
};

// Category → {childTable, nameCol, extraCols} for MySQL JOIN-based counting.
const CATEGORY_CHILD_MAP = {
  symptoms:             { table: 'prescription_symptoms',            nameCol: 'name',        outKey: 'name' },
  diagnoses:            { table: 'prescription_diagnoses',           nameCol: 'description', outKey: 'description' },
  medications:          { table: 'prescription_medications',         nameCol: 'brand_name',  outKey: 'brandName' },
  lab_investigations:   { table: 'prescription_lab_investigations',  nameCol: 'test_name',   outKey: 'testName' },
  labtests:             { table: 'prescription_lab_investigations',  nameCol: 'test_name',   outKey: 'testName' },
  labresults:           { table: 'prescription_lab_results',         nameCol: 'test_name',   outKey: 'testName' },
  examination_findings: { table: 'prescription_examination_findings', nameCol: 'name',       outKey: 'name' },
  procedures:           { table: 'prescription_procedures',          nameCol: 'name',        outKey: 'name' },
};

export const getFrequentlySeen = async (req, res, next) => {
  try {
    const { category = 'symptoms', doctor_id, organization_id, branch_id,
            organizationId, branchId, doctorId } = req.query;
    const docId = doctor_id || doctorId || req.user?.userId;
    const orgId = organization_id || organizationId || req.user?.organizationId;
    const brId  = branch_id || branchId || req.user?.branchId;

    const cfg = CATEGORY_CHILD_MAP[category];
    if (!cfg) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CATEGORY', message: `Invalid category: ${category}` },
      });
    }

    // Find top 50 recent prescription IDs matching the scope.
    const where = ['deleted_at IS NULL'];
    const params = [];
    if (docId) { where.push('doctor_id = ?'); params.push(docId); }
    if (orgId) { where.push('organization_id = ?'); params.push(orgId); }
    if (brId)  { where.push('branch_id = ?'); params.push(brId); }

    const [rxRows] = await query(
      `SELECT prescription_id FROM prescription WHERE ${where.join(' AND ')}
       ORDER BY visit_date DESC LIMIT 50`,
      params,
    );
    if (!rxRows.length) return res.json({ success: true, data: [] });

    const ids = rxRows.map((r) => r.prescription_id);
    const ph = ids.map(() => '?').join(',');
    const [items] = await query(
      `SELECT * FROM ${cfg.table} WHERE prescription_id IN (${ph})`,
      ids,
    );

    const countMap = {};
    for (const r of items) {
      const name = r[cfg.nameCol];
      if (!name) continue;
      if (!countMap[name]) {
        // Mapped item shape (mirrors what prescription.mapper.js produces).
        countMap[name] = {
          _count: 0,
          ..._mapChildItem(category, r),
        };
      }
      countMap[name]._count++;
    }
    const sorted = Object.values(countMap)
      .sort((a, b) => b._count - a._count)
      .slice(0, 10)
      .map(({ _count, ...item }) => item);
    return res.json({ success: true, data: sorted });
  } catch (error) {
    next(error);
  }
};

function _mapChildItem(category, r) {
  switch (category) {
    case 'symptoms':
      return { name: r.name, severity: r.severity || null, duration: r.duration || null, laterality: r.laterality || null, additionalInfo: r.additional_info || null };
    case 'diagnoses':
      return { icdCode: r.icd_code || null, description: r.description || null, type: r.type || null, status: r.status || null, since: r.since || null, notes: r.notes || null };
    case 'medications':
      return { brandName: r.brand_name || null, genericName: r.generic_name || null, form: r.form || null, dosage: r.dosage || null, frequency: r.frequency || null, timing: r.timing || null, duration: r.duration || null, startDateCondition: r.start_date_condition || null, quantity: r.quantity || null, instructions: r.instructions || null, isTapering: !!r.is_tapering };
    case 'lab_investigations':
    case 'labtests':
      return { testName: r.test_name || null, category: r.category || null, remarks: r.remarks || null, urgent: !!r.urgent };
    case 'labresults':
      return { testName: r.test_name || null, reading: r.reading || null, unit: r.unit || null, normalRange: r.normal_range || null, interpretation: r.interpretation || null };
    case 'examination_findings':
      return { name: r.name || null, notes: r.notes || null };
    case 'procedures':
      return { name: r.name || null, notes: r.notes || null };
    default:
      return {};
  }
}

// ─── Configuration ───────────────────────────────────────────────────────────
const DEFAULT_SECTION_ORDER = [
  'vitals', 'symptoms', 'diagnosis', 'examination',
  'medications', 'labInvestigations', 'labResults', 'medicalHistory',
  'procedures', 'followUp', 'referral', 'advice', 'notes', 'customSections',
];
const DEFAULT_ENABLED = {
  vitals: true, symptoms: true, diagnosis: true, examination: true,
  medications: true, labInvestigations: true, labResults: true, medicalHistory: true,
  procedures: true, followUp: true, referral: true, advice: true, notes: true, customSections: true,
};
const DEFAULT_PRINT_ENABLED = {
  vitals: true, symptoms: true, diagnosis: true,
  medications: true, labInvestigations: true, procedures: true, followUp: true, advice: true,
};

async function loadRxConfigMysql(configId) {
  const [cfgRows] = await query('SELECT * FROM prescription_config WHERE config_id = ? LIMIT 1', [configId]);
  if (!cfgRows.length) return null;
  const cfg = cfgRows[0];
  const [orderRows] = await query(
    'SELECT section_name, sort_order FROM prescription_config_section_order WHERE config_id = ? ORDER BY sort_order',
    [configId],
  );
  const [enabledRows] = await query(
    'SELECT section_name, is_enabled FROM prescription_config_enabled_sections WHERE config_id = ?',
    [configId],
  );
  const [printRows] = await query(
    'SELECT section_name, is_enabled FROM prescription_config_print_enabled_sections WHERE config_id = ?',
    [configId],
  );
  const [customRows] = await query(
    'SELECT section_key, title, sort_order, definition FROM prescription_config_custom_sections WHERE config_id = ? ORDER BY sort_order',
    [configId],
  );

  const section_order = orderRows.map((r) => r.section_name);
  const enabled_sections = {};
  for (const r of enabledRows) enabled_sections[r.section_name] = !!r.is_enabled;
  const print_enabled_sections = {};
  for (const r of printRows) print_enabled_sections[r.section_name] = !!r.is_enabled;
  const custom_sections = customRows.map((r) => {
    if (r.definition) {
      try { return JSON.parse(r.definition); } catch { /* fall through */ }
    }
    return { id: r.section_key, title: r.title, sort_order: r.sort_order };
  });

  return {
    _id: cfg.config_id,
    configId: cfg.config_id,
    organizationId: cfg.organization_id,
    branchId: cfg.branch_id,
    doctorId: cfg.doctor_id,
    section_order,
    enabled_sections,
    print_enabled_sections,
    custom_sections,
    createdAt: cfg.created_at ? new Date(cfg.created_at).toISOString() : null,
    updatedAt: cfg.updated_at ? new Date(cfg.updated_at).toISOString() : null,
  };
}

export const getConfiguration = async (req, res, next) => {
  try {
    const { organization_id, branch_id, doctor_id,
            organizationId, branchId, doctorId } = req.query;
    const orgId = organization_id || organizationId || req.user?.organizationId;
    const brId  = branch_id || branchId || req.user?.branchId;
    const docId = doctor_id || doctorId || req.user?.userId;

    const [rows] = await query(
      'SELECT config_id FROM prescription_config WHERE organization_id = ? AND branch_id = ? AND doctor_id = ? LIMIT 1',
      [orgId, brId, docId],
    );
    if (rows.length) {
      const data = await loadRxConfigMysql(rows[0].config_id);
      return res.json({ success: true, data });
    }
    return res.json({
      success: true,
      data: {
        section_order: DEFAULT_SECTION_ORDER,
        enabled_sections: { ...DEFAULT_ENABLED },
        print_enabled_sections: { ...DEFAULT_PRINT_ENABLED },
        custom_sections: [],
      },
    });
  } catch (error) {
    next(error);
  }
};

export const upsertConfiguration = async (req, res, next) => {
  try {
    const orgId = req.body.organization_id || req.body.organizationId || req.user?.organizationId;
    const brId  = req.body.branch_id || req.body.branchId || req.user?.branchId;
    const docId = req.body.doctor_id || req.body.doctorId || req.user?.userId;

    const savedConfigId = await withTransaction(async (conn) => {
      const [existing] = await conn.query(
        'SELECT config_id FROM prescription_config WHERE organization_id = ? AND branch_id = ? AND doctor_id = ? LIMIT 1',
        [orgId, brId, docId],
      );
      let configId;
      if (existing.length) {
        configId = existing[0].config_id;
      } else {
        configId = uuidv4();
        await conn.query(
          'INSERT INTO prescription_config (config_id, organization_id, branch_id, doctor_id) VALUES (?, ?, ?, ?)',
          [configId, orgId, brId, docId],
        );
      }

      if (Array.isArray(req.body.section_order)) {
        await conn.query('DELETE FROM prescription_config_section_order WHERE config_id = ?', [configId]);
        for (let i = 0; i < req.body.section_order.length; i++) {
          await conn.query(
            'INSERT INTO prescription_config_section_order (config_id, section_name, sort_order) VALUES (?, ?, ?)',
            [configId, req.body.section_order[i], i],
          );
        }
      }
      if (req.body.enabled_sections && typeof req.body.enabled_sections === 'object') {
        await conn.query('DELETE FROM prescription_config_enabled_sections WHERE config_id = ?', [configId]);
        for (const [k, v] of Object.entries(req.body.enabled_sections)) {
          await conn.query(
            'INSERT INTO prescription_config_enabled_sections (config_id, section_name, is_enabled) VALUES (?, ?, ?)',
            [configId, k, v ? 1 : 0],
          );
        }
      }
      if (req.body.print_enabled_sections && typeof req.body.print_enabled_sections === 'object') {
        await conn.query('DELETE FROM prescription_config_print_enabled_sections WHERE config_id = ?', [configId]);
        for (const [k, v] of Object.entries(req.body.print_enabled_sections)) {
          await conn.query(
            'INSERT INTO prescription_config_print_enabled_sections (config_id, section_name, is_enabled) VALUES (?, ?, ?)',
            [configId, k, v ? 1 : 0],
          );
        }
      }
      if (Array.isArray(req.body.custom_sections)) {
        await conn.query('DELETE FROM prescription_config_custom_sections WHERE config_id = ?', [configId]);
        for (let i = 0; i < req.body.custom_sections.length; i++) {
          const cs = req.body.custom_sections[i] || {};
          const sectionKey = cs.id || cs.sectionKey || cs.key || `custom_${i}`;
          await conn.query(
            'INSERT INTO prescription_config_custom_sections (config_id, section_key, title, sort_order, definition) VALUES (?, ?, ?, ?, ?)',
            [configId, sectionKey, cs.title || null, i, JSON.stringify(cs)],
          );
        }
      }
      return configId;
    });

    const data = await loadRxConfigMysql(savedConfigId);
    return res.json({ success: true, data, message: 'Configuration saved successfully' });
  } catch (error) {
    next(error);
  }
};

// ─── Patient Detail + History (for prescription pad) ─────────────────────────
export const getPatientDetailHistory = async (req, res, next) => {
  try {
    const patientId = req.query.id || req.params.id;
    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Patient id is required' },
      });
    }

    const [patRows] = await query(
      'SELECT * FROM patient WHERE patient_id = ? AND is_active = 1 LIMIT 1',
      [patientId],
    );
    if (!patRows.length) {
      return res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' },
      });
    }
    const patient = await mapPatientRow(patRows[0]);

    const [histRows] = await query(
      'SELECT * FROM patient_medical_history WHERE patient_id = ? LIMIT 1',
      [patientId],
    );
    let medicalHistory = null;
    if (histRows.length) medicalHistory = await mapPatientHistoryRow(histRows[0]);

    const [lastRxRows] = await query(
      `SELECT * FROM prescription WHERE patient_id = ? AND deleted_at IS NULL
       ORDER BY visit_date DESC LIMIT 1`,
      [patientId],
    );
    let lockedVitals = null;
    let lastVisitDate = null;
    if (lastRxRows.length) {
      const rx = await mapPrescriptionRow(lastRxRows[0]);
      lockedVitals = rx.vitals || null;
      lastVisitDate = rx.visitDate;
    }

    // Age display
    let ageDisplay = '';
    if (patient.dateOfBirth) {
      const dob = new Date(patient.dateOfBirth);
      const diffDays = Math.floor((Date.now() - dob.getTime()) / 86400000);
      if (diffDays < 30) ageDisplay = `${diffDays}d`;
      else if (diffDays < 730) ageDisplay = `${Math.floor(diffDays / 30)}m`;
      else ageDisplay = `${Math.floor(diffDays / 365)}y`;
    } else if (patient.age) {
      ageDisplay = `${patient.age}y`;
    }

    const genderMap = { M: 'Male', F: 'Female', Other: 'Other' };
    const addressParts = [];
    if (patient.address) {
      if (patient.address.street) addressParts.push(patient.address.street);
      if (patient.address.city)   addressParts.push(patient.address.city);
      if (patient.address.state)  addressParts.push(patient.address.state);
      if (patient.address.pincode) addressParts.push(patient.address.pincode);
    }

    return res.json({
      success: true,
      data: {
        fullName: `${patient.salutation ? patient.salutation + '. ' : ''}${patient.name}`,
        ageDisplay,
        genderDisplay: genderMap[patient.gender] || patient.gender,
        phoneDisplay: patient.phone,
        rawData: { address: addressParts.join(', '), ...patient },
        lockedVitals,
        medicalHistory,
        lastVisitDate,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Vitals Units (no DB) ────────────────────────────────────────────────────
export const getVitalUnits = async (req, res, next) => {
  try {
    const units = {
      pulse: [{ unit_id: 1, unit_name: 'bpm', is_default: true }],
      blood_pressure: [{ unit_id: 2, unit_name: 'mmHg', is_default: true }],
      respiratory_rate: [{ unit_id: 3, unit_name: 'breaths/min', is_default: true }],
      temperature: [
        { unit_id: 4, unit_name: '°F', is_default: true },
        { unit_id: 5, unit_name: '°C', is_default: false },
      ],
      height: [
        { unit_id: 6, unit_name: 'cm', is_default: true },
        { unit_id: 7, unit_name: 'ft', is_default: false },
      ],
      muscle_mass: [
        { unit_id: 8, unit_name: 'kg', is_default: true },
        { unit_id: 9, unit_name: 'lbs', is_default: false },
      ],
      head_circumference:    [{ unit_id: 10, unit_name: 'cm', is_default: true }],
      chest_circumference:   [{ unit_id: 11, unit_name: 'cm', is_default: true }],
      mid_arm_circumference: [{ unit_id: 12, unit_name: 'cm', is_default: true }],
      waist_circumference:   [{ unit_id: 13, unit_name: 'cm', is_default: true }],
    };
    res.json({ success: true, data: { units } });
  } catch (error) {
    next(error);
  }
};
