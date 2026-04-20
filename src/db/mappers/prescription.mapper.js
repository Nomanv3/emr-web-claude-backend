// prescription.mapper.js — SQL row + 11 child tables → Mongoose-shaped Prescription.
// Vitals are reconstructed as a keyed object: { bp: { value, unit, is_locked }, pulse: {...} }
// when any non-default metadata exists; otherwise plain { bp: "140/90", pulse: "82" }.
// Section config is reconstructed as { sectionOrder[], enabledSections{}, printEnabledSections{} }.
// customSections[] becomes [{ sectionId, title, items: [{key, value}] }].

import { query } from '../../config/mysql.js';

const toIso = (v) => (v ? new Date(v).toISOString() : null);
const toBool = (v) => v === 1 || v === true;

function buildVitals(rows) {
  const out = {};
  for (const r of rows) {
    // If the stored value has metadata (unit or locked flag) emit nested; else flat string.
    if (r.unit || toBool(r.is_locked)) {
      out[r.vital_name] = {
        value:     r.value_text,
        unit:      r.unit || null,
        is_locked: toBool(r.is_locked),
      };
    } else {
      out[r.vital_name] = r.value_text;
    }
  }
  return out;
}

function buildSectionConfig(rows) {
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const sectionOrder = sorted.map((r) => r.section_name);
  const enabledSections = {};
  const printEnabledSections = {};
  for (const r of sorted) {
    enabledSections[r.section_name] = toBool(r.is_enabled);
    printEnabledSections[r.section_name] = toBool(r.is_print_enabled);
  }
  return { sectionOrder, enabledSections, printEnabledSections };
}

/**
 * mapPrescriptionRow(row) — full prescription with all 11 child subdocs.
 * Lazy-loads children via pool to keep call sites compact. Pass `{loadChildren:false}`
 * to get just the parent shape (used by bulk list endpoints that don't need subdocs).
 */
export async function mapPrescriptionRow(row, opts = {}) {
  const loadChildren = opts.loadChildren !== false;
  const base = {
    _id:                  row.prescription_id,
    prescriptionId:       row.prescription_id,
    organizationId:       row.organization_id,
    branchId:             row.branch_id,
    patientId:            row.patient_id,
    appointmentId:        row.appointment_id || null,
    queueId:              row.queue_id || null,
    doctorId:             row.doctor_id,
    visitDate:            toIso(row.visit_date),
    followUpDate:         toIso(row.follow_up_date),
    followUpNotes:        row.follow_up_notes || null,
    followUpNotification: toBool(row.follow_up_notification),
    referralDoctorName:   row.referral_doctor_name || null,
    referralSpecialty:    row.referral_specialty || null,
    referralReason:       row.referral_reason || null,
    referralNotes:        row.referral_notes || null,
    advice:               row.advice || null,
    surgicalNotes:        row.surgical_notes || null,
    privateNotes:         row.private_notes || null,
    language:             row.language || 'en',
    pdfUrl:               row.pdf_url || null,
    isEdited:             toBool(row.is_edited),
    createdBy:            row.created_by || null,
    createdAt:            toIso(row.created_at),
    updatedAt:            toIso(row.updated_at),
  };

  if (!loadChildren) {
    return { ...base, vitals: {}, sectionConfig: {}, symptoms: [], diagnoses: [],
             examinationFindings: [], medications: [], labInvestigations: [], labResults: [],
             procedures: [], customSections: [] };
  }

  const rxId = row.prescription_id;
  const [
    [vitalRows],
    [cfgRows],
    [symRows],
    [diagRows],
    [examRows],
    [medRows],
    [labInvRows],
    [labResRows],
    [procRows],
    [customRows],
  ] = await Promise.all([
    query('SELECT * FROM prescription_vitals WHERE prescription_id = ? ORDER BY id', [rxId]),
    query('SELECT * FROM prescription_section_config WHERE prescription_id = ? ORDER BY sort_order', [rxId]),
    query('SELECT * FROM prescription_symptoms WHERE prescription_id = ? ORDER BY sort_order, id', [rxId]),
    query('SELECT * FROM prescription_diagnoses WHERE prescription_id = ? ORDER BY sort_order, id', [rxId]),
    query('SELECT * FROM prescription_examination_findings WHERE prescription_id = ? ORDER BY sort_order, id', [rxId]),
    query('SELECT * FROM prescription_medications WHERE prescription_id = ? ORDER BY sort_order, id', [rxId]),
    query('SELECT * FROM prescription_lab_investigations WHERE prescription_id = ? ORDER BY sort_order, id', [rxId]),
    query('SELECT * FROM prescription_lab_results WHERE prescription_id = ? ORDER BY sort_order, id', [rxId]),
    query('SELECT * FROM prescription_procedures WHERE prescription_id = ? ORDER BY sort_order, id', [rxId]),
    query('SELECT * FROM prescription_custom_sections WHERE prescription_id = ? ORDER BY sort_order, id', [rxId]),
  ]);

  let customSections = [];
  if (customRows.length) {
    const csIds = customRows.map((r) => r.id);
    const ph = csIds.map(() => '?').join(',');
    const [itemRows] = await query(
      `SELECT * FROM prescription_custom_section_items WHERE custom_section_id IN (${ph}) ORDER BY sort_order, id`,
      csIds
    );
    const itemMap = {};
    for (const it of itemRows) (itemMap[it.custom_section_id] ||= []).push({ key: it.item_key, value: it.item_value });
    customSections = customRows.map((cs) => ({
      sectionId: cs.section_id,
      title:     cs.title,
      items:     itemMap[cs.id] || [],
    }));
  }

  return {
    ...base,
    vitals:              buildVitals(vitalRows),
    sectionConfig:       buildSectionConfig(cfgRows),
    symptoms: symRows.map((s) => ({
      name:           s.name,
      severity:       s.severity || null,
      duration:       s.duration || null,
      laterality:     s.laterality || null,
      additionalInfo: s.additional_info || null,
    })),
    diagnoses: diagRows.map((d) => ({
      icdCode:     d.icd_code || null,
      description: d.description || null,
      type:        d.type || null,
      status:      d.status || null,
      since:       d.since || null,
      notes:       d.notes || null,
    })),
    examinationFindings: examRows.map((e) => ({
      name:  e.name,
      notes: e.notes || null,
    })),
    medications: medRows.map((m) => ({
      brandName:           m.brand_name || null,
      genericName:         m.generic_name || null,
      form:                m.form || null,
      dosage:              m.dosage || null,
      frequency:           m.frequency || null,
      timing:              m.timing || null,
      duration:            m.duration || null,
      startDateCondition:  m.start_date_condition || null,
      quantity:            m.quantity || null,
      instructions:        m.instructions || null,
      isTapering:          toBool(m.is_tapering),
    })),
    labInvestigations: labInvRows.map((l) => ({
      testName: l.test_name || null,
      category: l.category || null,
      testOn:   toIso(l.test_on),
      repeatOn: toIso(l.repeat_on),
      remarks:  l.remarks || null,
      urgent:   toBool(l.urgent),
    })),
    labResults: labResRows.map((l) => ({
      testName:       l.test_name || null,
      reading:        l.reading || null,
      unit:           l.unit || null,
      normalRange:    l.normal_range || null,
      interpretation: l.interpretation || null,
      resultDate:     toIso(l.result_date),
      notes:          l.notes || null,
    })),
    procedures: procRows.map((p) => ({
      name:          p.name || null,
      procedureDate: toIso(p.procedure_date),
      notes:         p.notes || null,
    })),
    customSections,
  };
}
