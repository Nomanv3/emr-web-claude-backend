import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const receiptSchema = new mongoose.Schema({
  receiptId: { type: String, default: uuidv4, unique: true, index: true },
  paymentId: { type: String, required: true },
  invoiceId: { type: String, required: true },
  receiptNumber: { type: String, unique: true },
  pdfUrl: { type: String },
  generatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

receiptSchema.pre('save', async function (next) {
  if (!this.receiptNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('Receipt').countDocuments();
    this.receiptNumber = `RCT-${year}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

export default mongoose.model('Receipt', receiptSchema);
