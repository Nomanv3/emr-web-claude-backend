import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const invoiceSchema = new mongoose.Schema({
  invoiceId: { type: String, default: uuidv4, unique: true, index: true },
  organizationId: { type: String, required: true },
  patientId: { type: String, required: true, index: true },
  appointmentId: { type: String },
  lineItems: [{
    description: String,
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  }],
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balanceDue: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['Unpaid', 'Partial', 'Paid'],
    default: 'Unpaid',
  },
}, { timestamps: true });

export default mongoose.model('Invoice', invoiceSchema);
