import mongoose from 'mongoose';

const dropdownOptionSchema = new mongoose.Schema({
  dropdown_option_id: { type: Number, required: true, unique: true, index: true },
  section: { type: String, required: true, index: true },
  option_key: { type: String, required: true, index: true },
  option_value: { type: String, required: true },
  sort_order: { type: Number, default: 0 },
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

dropdownOptionSchema.index({ section: 1, option_key: 1 });

export default mongoose.model('DropdownOption', dropdownOptionSchema);
