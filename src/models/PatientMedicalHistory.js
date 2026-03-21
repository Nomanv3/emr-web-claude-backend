import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const patientMedicalHistorySchema = new mongoose.Schema({
  historyId: { type: String, default: uuidv4, unique: true, index: true },
  patientId: { type: String, required: true, index: true },
  conditions: [{
    name: String,
    value: { type: String, enum: ['Y', 'N', '-'] },
    since: String,
    notes: String,
  }],
  allergies: [{
    allergen: String,
    severity: String,
    reaction: String,
  }],
  surgicalHistory: [{
    procedure: String,
    date: Date,
    notes: String,
  }],
  familyHistory: [{
    relation: String,
    condition: String,
  }],
  noHistory: { type: Boolean, default: false },
  updatedBy: { type: String },
}, { timestamps: true });

export default mongoose.model('PatientMedicalHistory', patientMedicalHistorySchema);
