// invoice.mapper.js — SQL row → Mongoose-shaped Invoice object.
// Reconstructs `lineItems[]` from invoice_line_items rows.

const toIso = (v) => (v ? new Date(v).toISOString() : null);
const toNum = (v) => (v === null || v === undefined ? 0 : parseFloat(v));

export function mapInvoiceRow(row, lineItemRows = []) {
  const lineItems = lineItemRows
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((li) => ({
      description: li.description || null,
      quantity:    Number(li.quantity) || 0,
      unitPrice:   toNum(li.unit_price),
      discount:    toNum(li.discount),
      total:       toNum(li.total),
    }));

  return {
    _id:            row.invoice_id,
    invoiceId:      row.invoice_id,
    organizationId: row.organization_id,
    patientId:      row.patient_id,
    appointmentId:  row.appointment_id || null,
    lineItems,
    subtotal:       toNum(row.subtotal),
    discount:       toNum(row.discount),
    tax:            toNum(row.tax),
    totalAmount:    toNum(row.total_amount),
    paidAmount:     toNum(row.paid_amount),
    balanceDue:     toNum(row.balance_due),
    status:         row.status,
    createdAt:      toIso(row.created_at),
    updatedAt:      toIso(row.updated_at),
  };
}
