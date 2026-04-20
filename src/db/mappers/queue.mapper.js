// queue.mapper.js — SQL row → Mongoose-shaped JS object for the `queue` table.
// Also reconstructs the embedded `services[]` array from queue_services rows.

const toIso = (v) => (v ? new Date(v).toISOString() : null);

/**
 * mapQueueRow(row, serviceRows) — projects a `queue` row into the Mongoose shape.
 *
 * @param {object}   row         — single row from the `queue` table
 * @param {object[]} serviceRows — rows from `queue_services` for this queue entry
 *                                 (pass [] if not joining services)
 */
export function mapQueueRow(row, serviceRows = []) {
  const services = serviceRows.map((s) => ({
    serviceId: s.service_id || null,
    name:      s.name || null,
    price:     parseFloat(s.price) || 0,
  }));

  return {
    _id:             row.queue_id,
    queueId:         row.queue_id,
    organizationId:  row.organization_id,
    branchId:        row.branch_id,
    appointmentId:   row.appointment_id || null,
    patientId:       row.patient_id,
    patientName:     row.patient_name || null,
    uhid:            row.uhid || null,
    tokenNumber:     row.token_number != null ? Number(row.token_number) : null,
    slot:            row.slot || null,
    queueDate:       row.queue_date,
    arrivalTime:     toIso(row.arrival_time),
    status:          row.status,
    paymentStatus:   row.payment_status || null,
    paymentAmount:   parseFloat(row.payment_amount) || 0,
    services,
    serviceAmount:   parseFloat(row.service_amount) || 0,
    appointmentType: row.appointment_type,
    checkInTime:     row.check_in_time || null,
    tags:            row.tags || null,
    durationMinutes: row.duration_minutes != null ? Number(row.duration_minutes) : 15,
    invoiceId:       row.invoice_id || null,
    notes:           row.notes || null,
    createdBy:       row.created_by || null,
    createdAt:       toIso(row.created_at),
    updatedAt:       toIso(row.updated_at),
  };
}
