import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const masterSymptomSchema = new mongoose.Schema({
  symptomId: { type: String, default: uuidv4, unique: true, index: true },
  name: { type: String, required: true, index: true },
  category: { type: String },
  icdMapping: { type: String },
}, { timestamps: true });

export default mongoose.model('MasterSymptom', masterSymptomSchema);
