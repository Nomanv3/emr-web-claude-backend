// patientHistory.mapper.js — SQL rows → Mongoose-shaped PatientMedicalHistory object.
// Reconstructs conditions[], allergies[], surgicalHistory[], familyHistory[] subdoc arrays.

const toIso = (v) => (v ? new Date(v).toISOString() : null);
const toBool = (v) => v === 1 || v === true;

const toDateIso = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return new Date(`${v}T00:00:00.000Z`).toISOString();
  return new Date(v).toISOString();
};

export function mapPatientHistoryRow(row, conditions = [], allergies = [], surgical = [], family = []) {
  return {
    _id:         row.history_id,
    historyId:   row.history_id,
    patientId:   row.patient_id,
    noHistory:   toBool(row.no_history),
    conditions:  conditions.map((c) => ({
      name:  c.name,
      value: c.value,
      since: c.since || null,
      notes: c.notes || null,
    })),
    allergies:   allergies.map((a) => ({
      allergen: a.allergen,
      severity: a.severity || null,
      reaction: a.reaction || null,
    })),
    surgicalHistory: surgical.map((s) => ({
      procedure: s.procedure_name,
      date:      toDateIso(s.procedure_date),
      notes:     s.notes || null,
    })),
    familyHistory: family.map((f) => ({
      relation:  f.relation,
      condition: f.condition_desc,
    })),
    updatedBy:   row.updated_by || null,
    createdAt:   toIso(row.created_at),
    updatedAt:   toIso(row.updated_at),
  };
}
