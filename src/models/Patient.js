import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const patientSchema = new mongoose.Schema({
  patientId: { type: String, default: uuidv4, unique: true, index: true },
  uhid: { type: String, unique: true, index: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true },
  salutation: {
    type: String,
    enum: ['Mr', 'Mrs', 'Ms', 'Dr', 'Master', 'Baby'],
  },
  name: { type: String, required: true, trim: true, index: true },
  gender: { type: String, enum: ['M', 'F', 'Other'], required: true },
  dateOfBirth: { type: Date },
  age: { type: Number },
  phone: { type: String, required: true, trim: true, index: true },
  alternatePhone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    pincode: String,
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
  },
  tags: [{ type: String }],
  isActive: { type: Boolean, default: true },
  createdBy: { type: String },
}, { timestamps: true });

export default mongoose.model('Patient', patientSchema);
