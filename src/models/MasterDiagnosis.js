import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const masterDiagnosisSchema = new mongoose.Schema({
  diagnosisId: { type: String, default: uuidv4, unique: true, index: true },
  icdCode: { type: String, required: true, index: true },
  description: { type: String, required: true, index: true },
  category: { type: String },
}, { timestamps: true });

export default mongoose.model('MasterDiagnosis', masterDiagnosisSchema);
