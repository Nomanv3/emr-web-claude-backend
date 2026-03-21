import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const masterExaminationFindingSchema = new mongoose.Schema({
  findingId: { type: String, default: uuidv4, unique: true, index: true },
  name: { type: String, required: true, index: true },
  category: { type: String },
}, { timestamps: true });

export default mongoose.model('MasterExaminationFinding', masterExaminationFindingSchema);
