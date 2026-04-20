// patient.mapper.js — SQL row → Mongoose-shaped JS object for the `patient` table.
// Reconstructs nested `address` object and `tags[]` array from flat columns + child rows.

const toIso = (v) => (v ? new Date(v).toISOString() : null);
const toBool = (v) => v === 1 || v === true;

/** Convert MySQL DATE ('2026-04-18') or Date object to ISO-8601 string, or null. */
const toDobIso = (v) => {
  if (!v) return null;
  if (typeof v === 'string') {
    // Already 'YYYY-MM-DD'; treat as UTC midnight so toISOString matches Mongo behaviour
    return new Date(`${v}T00:00:00.000Z`).toISOString();
  }
  return new Date(v).toISOString();
};

export function mapPatientRow(row, tagRows = []) {
  return {
    _id:            row.patient_id,
    patientId:      row.patient_id,
    uhid:           row.uhid,
    organizationId: row.organization_id,
    branchId:       row.branch_id,
    salutation:     row.salutation || null,
    name:           row.name,
    gender:         row.gender,
    dateOfBirth:    toDobIso(row.date_of_birth),
    age:            row.age != null ? Number(row.age) : null,
    phone:          row.phone,
    alternatePhone: row.alternate_phone || null,
    email:          row.email || null,
    address: {
      street:   row.address_street || null,
      city:     row.address_city || null,
      state:    row.address_state || null,
      country:  row.address_country || null,
      pincode:  row.address_pincode || null,
    },
    bloodGroup:     row.blood_group || null,
    tags:           tagRows.map((t) => t.tag),
    isActive:       toBool(row.is_active),
    createdBy:      row.created_by || null,
    createdAt:      toIso(row.created_at),
    updatedAt:      toIso(row.updated_at),
  };
}

/** Projection used by searchPatients — matches Mongoose `.select()` in the controller. */
export function mapPatientSearchRow(row) {
  return {
    _id:       row.patient_id,
    patientId: row.patient_id,
    name:      row.name,
    phone:     row.phone,
    uhid:      row.uhid,
    gender:    row.gender,
    age:       row.age != null ? Number(row.age) : null,
  };
}
