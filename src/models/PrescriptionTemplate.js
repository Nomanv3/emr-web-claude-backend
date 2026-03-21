import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const prescriptionTemplateSchema = new mongoose.Schema({
  templateId: { type: String, default: uuidv4, unique: true, index: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String },
  doctorId: { type: String },
  type: {
    type: String,
    enum: ['symptom', 'medication', 'labtest', 'labresult', 'diagnosis', 'examination', 'procedure', 'global'],
    required: true,
  },
  name: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed },
  isGlobal: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('PrescriptionTemplate', prescriptionTemplateSchema);
