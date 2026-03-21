import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const paymentSchema = new mongoose.Schema({
  paymentId: { type: String, default: uuidv4, unique: true, index: true },
  invoiceId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  method: {
    type: String,
    enum: ['Cash', 'Card', 'Online', 'UPI'],
    required: true,
  },
  transactionRef: { type: String },
  collectedBy: { type: String },
  collectedAt: { type: Date, default: Date.now },
  receiptId: { type: String },
}, { timestamps: true });

export default mongoose.model('Payment', paymentSchema);
