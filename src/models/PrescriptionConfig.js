import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const prescriptionConfigSchema = new mongoose.Schema({
  configId: { type: String, default: uuidv4, unique: true, index: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true },
  doctorId: { type: String, required: true },
  section_order: { type: [String], default: [
    'vitals', 'symptoms', 'diagnosis', 'examination',
    'medications', 'labInvestigations', 'labResults', 'medicalHistory',
    'procedures', 'followUp', 'referral', 'advice', 'notes', 'customSections',
  ]},
  enabled_sections: { type: mongoose.Schema.Types.Mixed, default: { vitals: true, symptoms: true, diagnosis: true, examination: true, medications: true, labInvestigations: true, labResults: true, medicalHistory: true, procedures: true, followUp: true, referral: true, advice: true, notes: true, customSections: true } },
  print_enabled_sections: { type: mongoose.Schema.Types.Mixed, default: { vitals: true, symptoms: true, diagnosis: true, medications: true, labInvestigations: true, labResults: true, medicalHistory: true, procedures: true, followUp: true, referral: true, advice: true, notes: true } },
  custom_sections: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });

prescriptionConfigSchema.index({ organizationId: 1, branchId: 1, doctorId: 1 }, { unique: true });

export default mongoose.model('PrescriptionConfig', prescriptionConfigSchema);
