import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const masterServiceSchema = new mongoose.Schema({
  serviceId: { type: String, default: uuidv4, unique: true, index: true },
  organizationId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  category: { type: String },
  defaultPrice: { type: Number, default: 0 },
  description: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('MasterService', masterServiceSchema);
