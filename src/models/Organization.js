import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const organizationSchema = new mongoose.Schema({
  organizationId: { type: String, default: uuidv4, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    pincode: String,
  },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  logo: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('Organization', organizationSchema);
