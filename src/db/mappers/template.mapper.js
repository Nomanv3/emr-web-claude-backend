// template.mapper.js — SQL row → Mongoose-shaped PrescriptionTemplate.
// `data` is stored as MEDIUMTEXT (JSON string) — parsed back on read.

const toIso = (v) => (v ? new Date(v).toISOString() : null);
const toBool = (v) => v === 1 || v === true;

function parseData(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  const s = String(raw).trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch { return raw; }
}

export function mapTemplateRow(row) {
  return {
    _id:            row.template_id,
    templateId:     row.template_id,
    organizationId: row.organization_id,
    branchId:       row.branch_id || null,
    doctorId:       row.doctor_id || null,
    type:           row.type,
    name:           row.name,
    data:           parseData(row.data),
    isGlobal:       toBool(row.is_global),
    createdAt:      toIso(row.created_at),
    updatedAt:      toIso(row.updated_at),
  };
}
