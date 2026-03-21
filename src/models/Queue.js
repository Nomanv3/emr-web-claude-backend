import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const queueSchema = new mongoose.Schema({
  queueId: { type: String, default: uuidv4, unique: true, index: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true },
  appointmentId: { type: String },
  patientId: { type: String, required: true },
  patientName: { type: String },
  uhid: { type: String },
  tokenNumber: { type: Number },
  slot: { type: String },
  queueDate: { type: String, required: true, index: true },
  arrivalTime: { type: Date },
  status: {
    type: String,
    enum: ['Waiting', 'Ongoing', 'Completed', 'Cancelled'],
    default: 'Waiting',
  },
  paymentStatus: { type: String },
  paymentAmount: { type: Number, default: 0 },
  services: [{
    serviceId: { type: String },
    name: { type: String },
    price: { type: Number, default: 0 },
    _id: false,
  }],
  serviceAmount: { type: Number, default: 0 },
  appointmentType: { type: String, enum: ['walk_in', 'scheduled', 'emergency', 'followup'], default: 'walk_in' },
  checkInTime: { type: String },
  tags: { type: String },
  durationMinutes: { type: Number, default: 15 },
  invoiceId: { type: String },
  notes: { type: String },
  createdBy: { type: String },
}, { timestamps: true });

export default mongoose.model('Queue', queueSchema);
