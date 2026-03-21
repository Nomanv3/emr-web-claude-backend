import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const masterLabTestSchema = new mongoose.Schema({
  testId: { type: String, default: uuidv4, unique: true, index: true },
  name: { type: String, required: true, index: true },
  category: { type: String },
  normalRange: { type: String },
  unit: { type: String },
}, { timestamps: true });

export default mongoose.model('MasterLabTest', masterLabTestSchema);
