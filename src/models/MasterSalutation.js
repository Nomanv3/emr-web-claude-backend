import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const masterSalutationSchema = new mongoose.Schema({
  salutationId: { type: String, default: uuidv4, unique: true, index: true },
  label: { type: String, required: true },
}, { timestamps: true });

export default mongoose.model('MasterSalutation', masterSalutationSchema);
