import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const masterProcedureSchema = new mongoose.Schema({
  procedureId: { type: String, default: uuidv4, unique: true, index: true },
  name: { type: String, required: true, index: true },
  category: { type: String },
}, { timestamps: true });

export default mongoose.model('MasterProcedure', masterProcedureSchema);
