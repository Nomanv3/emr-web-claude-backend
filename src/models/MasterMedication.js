import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const masterMedicationSchema = new mongoose.Schema({
  medicationId: { type: String, default: uuidv4, unique: true, index: true },
  brandName: { type: String, required: true, index: true },
  genericName: { type: String, index: true },
  form: { type: String },
  strength: { type: String },
  manufacturer: { type: String },
}, { timestamps: true });

export default mongoose.model('MasterMedication', masterMedicationSchema);
