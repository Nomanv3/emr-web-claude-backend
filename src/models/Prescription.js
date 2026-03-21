import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const prescriptionSchema = new mongoose.Schema({
  prescriptionId: { type: String, default: uuidv4, unique: true, index: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true },
  patientId: { type: String, required: true, index: true },
  appointmentId: { type: String },
  queueId: { type: String },
  doctorId: { type: String, required: true },
  visitDate: { type: Date, default: Date.now },
  vitals: { type: mongoose.Schema.Types.Mixed },
  symptoms: [{
    name: String,
    severity: String,
    duration: String,
    laterality: String,
    additionalInfo: String,
  }],
  diagnoses: [{
    icdCode: String,
    description: String,
    type: { type: String },
    status: String,
    since: String,
    notes: String,
  }],
  examinationFindings: [{
    name: String,
    notes: String,
  }],
  medications: [{
    brandName: String,
    genericName: String,
    form: String,
    dosage: String,
    frequency: String,
    timing: String,
    duration: String,
    startDateCondition: String,
    quantity: String,
    instructions: String,
    isTapering: { type: Boolean, default: false },
  }],
  labInvestigations: [{
    testName: String,
    category: String,
    testOn: Date,
    repeatOn: Date,
    remarks: String,
    urgent: { type: Boolean, default: false },
  }],
  labResults: [{
    testName: String,
    reading: String,
    unit: String,
    normalRange: String,
    interpretation: String,
    date: Date,
    notes: String,
  }],
  procedures: [{
    name: String,
    date: Date,
    notes: String,
  }],
  followUp: {
    date: Date,
    notes: String,
    notificationEnabled: { type: Boolean, default: false },
  },
  referral: {
    doctorName: String,
    specialty: String,
    reason: String,
    notes: String,
  },
  advice: { type: String },
  notes: {
    surgicalNotes: String,
    privateNotes: String,
  },
  customSections: [{
    id: String,
    title: String,
    items: [{
      key: String,
      value: String,
    }],
  }],
  sectionConfig: { type: mongoose.Schema.Types.Mixed },
  language: { type: String, default: 'en' },
  pdfUrl: { type: String },
  isEdited: { type: Boolean, default: false },
  createdBy: { type: String },
}, { timestamps: true });

export default mongoose.model('Prescription', prescriptionSchema);
