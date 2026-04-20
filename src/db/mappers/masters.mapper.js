// masters.mapper.js — SQL row → Mongoose-shaped JS object for all master tables.
// Each mapper reproduces the exact field names returned by the Mongoose models
// so the frontend sees zero difference between the Mongo and MySQL paths.

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a MySQL TIMESTAMP / Date object to ISO-8601 string, or null. */
const toIso = (v) => (v ? new Date(v).toISOString() : null);

/** Convert MySQL TINYINT(1) 0/1 to a real JS boolean. */
const toBool = (v) => v === 1 || v === true;

// ─── master_symptom ──────────────────────────────────────────────────────────
export function mapSymptomRow(row) {
  return {
    _id:        row.symptom_id,
    symptomId:  row.symptom_id,
    name:       row.name,
    category:   row.category || null,
    icdMapping: row.icd_mapping || null,
    createdAt:  toIso(row.created_at),
    updatedAt:  toIso(row.updated_at),
  };
}

// ─── master_diagnosis ────────────────────────────────────────────────────────
export function mapDiagnosisRow(row) {
  return {
    _id:         row.diagnosis_id,
    diagnosisId: row.diagnosis_id,
    icdCode:     row.icd_code,
    description: row.description,
    category:    row.category || null,
    createdAt:   toIso(row.created_at),
    updatedAt:   toIso(row.updated_at),
  };
}

// ─── master_medication ───────────────────────────────────────────────────────
export function mapMedicationRow(row) {
  return {
    _id:          row.medication_id,
    medicationId: row.medication_id,
    brandName:    row.brand_name,
    genericName:  row.generic_name || null,
    form:         row.form || null,
    strength:     row.strength || null,
    manufacturer: row.manufacturer || null,
    createdAt:    toIso(row.created_at),
    updatedAt:    toIso(row.updated_at),
  };
}

// ─── master_lab_test ─────────────────────────────────────────────────────────
export function mapLabTestRow(row) {
  return {
    _id:         row.test_id,
    testId:      row.test_id,
    name:        row.name,
    category:    row.category || null,
    normalRange: row.normal_range || null,
    unit:        row.unit || null,
    createdAt:   toIso(row.created_at),
    updatedAt:   toIso(row.updated_at),
  };
}

// ─── master_examination_finding ──────────────────────────────────────────────
export function mapFindingRow(row) {
  return {
    _id:       row.finding_id,
    findingId: row.finding_id,
    name:      row.name,
    category:  row.category || null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ─── master_procedure ────────────────────────────────────────────────────────
export function mapProcedureRow(row) {
  return {
    _id:         row.procedure_id,
    procedureId: row.procedure_id,
    name:        row.name,
    category:    row.category || null,
    createdAt:   toIso(row.created_at),
    updatedAt:   toIso(row.updated_at),
  };
}

// ─── master_salutation ───────────────────────────────────────────────────────
export function mapSalutationRow(row) {
  return {
    _id:          row.salutation_id,
    salutationId: row.salutation_id,
    label:        row.label,
    createdAt:    toIso(row.created_at),
    updatedAt:    toIso(row.updated_at),
  };
}

// ─── master_service ──────────────────────────────────────────────────────────
export function mapServiceRow(row) {
  return {
    _id:            row.service_id,
    serviceId:      row.service_id,
    organizationId: row.organization_id,
    name:           row.name,
    category:       row.category || null,
    defaultPrice:   parseFloat(row.default_price) || 0,
    description:    row.description || '',
    isActive:       toBool(row.is_active),
    createdAt:      toIso(row.created_at),
    updatedAt:      toIso(row.updated_at),
  };
}
