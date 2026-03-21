import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const branchSchema = new mongoose.Schema({
  branchId: { type: String, default: uuidv4, unique: true, index: true },
  organizationId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    pincode: String,
  },
  timezone: { type: String, default: 'Asia/Kolkata' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('Branch', branchSchema);
