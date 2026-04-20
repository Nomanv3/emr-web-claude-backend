// appointment.mapper.js — SQL row → Mongoose-shaped JS object for the `appointment` table.
// Reconstructs embedded `services[]` and `serviceIds[]` from child table rows.

const toIso = (v) => (v ? new Date(v).toISOString() : null);
const toBool = (v) => v === 1 || v === true;

/**
 * mapAppointmentRow(row, serviceRows, serviceIdRows) — projects an `appointment`
 * row into the Mongoose shape.
 *
 * @param {object}   row            — single row from the `appointment` table
 * @param {object[]} serviceRows    — rows from `appointment_services` for this appointment
 * @param {object[]} serviceIdRows  — rows from `appointment_service_ids` for this appointment
 */
export function mapAppointmentRow(row, serviceRows = [], serviceIdRows = []) {
  const services = serviceRows.map((s) => ({
    serviceId: s.service_id || null,
    name:      s.name || null,
    price:     parseFloat(s.price) || 0,
  }));

  const serviceIds = serviceIdRows.map((s) => s.service_id);

  return {
    _id:                  row.appointment_id,
    appointmentId:        row.appointment_id,
    organizationId:       row.organization_id,
    branchId:             row.branch_id,
    patientId:            row.patient_id,
    patientName:          row.patient_name || null,
    phone:                row.phone || null,
    doctorId:             row.doctor_id,
    services,
    serviceIds,
    slot:                 row.slot || null,
    slotDate:             row.slot_date || null,
    slotStartUTC:         toIso(row.slot_start_utc),
    slotEndUTC:           toIso(row.slot_end_utc),
    appointmentTime:      row.appointment_time || null,
    startTime:            row.start_time || null,
    endTime:              row.end_time || null,
    durationMinutes:      row.duration_minutes != null ? Number(row.duration_minutes) : 15,
    tags:                 row.tags || null,
    followUpDate:         row.follow_up_date || null,
    status:               row.status,
    paymentStatus:        row.payment_status,
    notes:                row.notes || null,
    isFollowUp:           toBool(row.is_follow_up),
    parentAppointmentId:  row.parent_appointment_id || null,
    createdBy:            row.created_by || null,
    createdAt:            toIso(row.created_at),
    updatedAt:            toIso(row.updated_at),
  };
}
