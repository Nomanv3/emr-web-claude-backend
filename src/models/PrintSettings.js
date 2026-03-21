import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const printSettingsSchema = new mongoose.Schema({
  settingsId: { type: String, default: uuidv4, unique: true, index: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export default mongoose.model('PrintSettings', printSettingsSchema);
