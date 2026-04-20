// payment.mapper.js — SQL row → Mongoose-shaped Payment and Receipt objects.

const toIso = (v) => (v ? new Date(v).toISOString() : null);
const toNum = (v) => (v === null || v === undefined ? 0 : parseFloat(v));

export function mapPaymentRow(row) {
  return {
    _id:            row.payment_id,
    paymentId:      row.payment_id,
    invoiceId:      row.invoice_id,
    amount:         toNum(row.amount),
    method:         row.method,
    transactionRef: row.transaction_ref || null,
    collectedBy:    row.collected_by || null,
    collectedAt:    toIso(row.collected_at),
    receiptId:      row.receipt_id || null,
    createdAt:      toIso(row.created_at),
    updatedAt:      toIso(row.updated_at),
  };
}

export function mapReceiptRow(row) {
  return {
    _id:           row.receipt_id,
    receiptId:     row.receipt_id,
    paymentId:     row.payment_id,
    invoiceId:     row.invoice_id,
    receiptNumber: row.receipt_number,
    pdfUrl:        row.pdf_url || null,
    generatedAt:   toIso(row.generated_at),
    createdAt:     toIso(row.created_at),
    updatedAt:     toIso(row.updated_at),
  };
}
