import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const appointmentSchema = new mongoose.Schema({
  appointmentId: { type: String, default: uuidv4, unique: true, index: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true },
  patientId: { type: String, required: true, index: true },
  patientName: { type: String },
  phone: { type: String },
  doctorId: { type: String, required: true },
  services: [{
    serviceId: { type: String },
    name: { type: String },
    price: { type: Number, default: 0 },
    _id: false,
  }],
  serviceIds: [{ type: String }],  // Keep for backward compat
  slot: { type: String },
  slotDate: { type: String },
  slotStartUTC: { type: Date },
  slotEndUTC: { type: Date },
  appointmentTime: { type: String },
  startTime: { type: String },
  endTime: { type: String },
  durationMinutes: { type: Number, default: 15 },
  tags: { type: String },
  followUpDate: { type: String },
  status: {
    type: String,
    enum: ['Booked', 'Follow Up', 'Ongoing', 'Completed', 'Cancelled'],
    default: 'Booked',
  },
  paymentStatus: {
    type: String,
    enum: ['Paid', 'Pending', 'Partial'],
    default: 'Pending',
  },
  notes: { type: String },
  isFollowUp: { type: Boolean, default: false },
  parentAppointmentId: { type: String },
  createdBy: { type: String },
}, { timestamps: true });

export default mongoose.model('Appointment', appointmentSchema);
