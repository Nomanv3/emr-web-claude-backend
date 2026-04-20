// user.mapper.js — SQL row → Mongoose-shaped JS object for the `user` table.
// password_hash is NEVER included — mirrors User.toJSON() which deletes passwordHash.

const toIso = (v) => (v ? new Date(v).toISOString() : null);
const toBool = (v) => v === 1 || v === true;

/**
 * mapUserRow(row) — projects a `user` table row into the shape that
 * auth.controller.js's `buildSafeUser` / Mongoose `toJSON()` would produce.
 * password_hash is excluded.
 */
export function mapUserRow(row) {
  return {
    _id:                row.user_id,
    userId:             row.user_id,
    organizationId:     row.organization_id,
    branchId:           row.branch_id,
    username:           row.username,
    email:              row.email,
    role:               row.role,
    name:               row.name,
    qualifications:     row.qualifications || null,
    registrationNumber: row.registration_number || null,
    signature:          row.signature || null,
    specialization:     row.specialization || null,
    isActive:           toBool(row.is_active),
    createdAt:          toIso(row.created_at),
    updatedAt:          toIso(row.updated_at),
  };
}

/**
 * mapUserRowWithHash(row) — same as mapUserRow but INCLUDES password_hash.
 * Used ONLY internally by auth controller for bcrypt.compare; never sent to client.
 */
export function mapUserRowWithHash(row) {
  return {
    ...mapUserRow(row),
    passwordHash: row.password_hash,
  };
}
