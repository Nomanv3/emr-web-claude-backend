import Prescription from '../models/Prescription.js';
import Queue from '../models/Queue.js';
import DropdownOption from '../models/DropdownOption.js';
import PrescriptionConfig from '../models/PrescriptionConfig.js';
import MasterSymptom from '../models/MasterSymptom.js';
import MasterDiagnosis from '../models/MasterDiagnosis.js';
import MasterMedication from '../models/MasterMedication.js';
import MasterLabTest from '../models/MasterLabTest.js';
import MasterExaminationFinding from '../models/MasterExaminationFinding.js';
import MasterProcedure from '../models/MasterProcedure.js';
import Patient from '../models/Patient.js';
import PatientMedicalHistory from '../models/PatientMedicalHistory.js';

export const savePrescription = async (req, res, next) => {
  try {
    const prescription = new Prescription({
      organizationId: req.body.organization_id || req.body.organizationId,
      branchId: req.body.branch_id || req.body.branchId,
      patientId: req.body.patient_id || req.body.patientId,
      appointmentId: req.body.appointment_id || req.body.appointmentId,
      queueId: req.body.queue_id || req.body.queueId,
      doctorId: req.body.doctor_id || req.body.doctorId,
      visitDate: req.body.visitDate || new Date(),
      vitals: req.body.vitals,
      symptoms: req.body.symptoms,
      diagnoses: req.body.diagnoses,
      examinationFindings: req.body.examinationFindings || req.body.examination_findings,
      medications: req.body.medications || req.body.medication,
      labInvestigations: req.body.labInvestigations || req.body.LabInv,
      labResults: req.body.labResults,
      procedures: req.body.procedures,
      followUp: req.body.followUp || (req.body.followUps && req.body.followUps[0]),
      referral: req.body.referral || (req.body.referToDoctor && req.body.referToDoctor[0]),
      advice: Array.isArray(req.body.advices) ? req.body.advices.join('\n') : req.body.advice,
      notes: req.body.notes,
      customSections: req.body.customSections,
      sectionConfig: req.body.sectionConfig,
      language: req.body.language,
      createdBy: req.body.created_by || req.user?.userId,
    });

    await prescription.save();

    if (prescription.queueId) {
      await Queue.findOneAndUpdate(
        { queueId: prescription.queueId },
        { status: 'Completed' }
      );
    }

    res.status(201).json({
      success: true,
      data: {
        prescriptionId: prescription.prescriptionId,
        pdfUrl: prescription.pdfUrl,
      },
      message: 'Prescription saved successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const updatePrescription = async (req, res, next) => {
  try {
    const prescriptionId = req.body.prescription_id || req.body.prescriptionId;

    if (!prescriptionId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'prescription_id is required' },
      });
    }

    const updateData = {
      vitals: req.body.vitals,
      symptoms: req.body.symptoms,
      diagnoses: req.body.diagnoses,
      examinationFindings: req.body.examinationFindings || req.body.examination_findings,
      medications: req.body.medications || req.body.medication,
      labInvestigations: req.body.labInvestigations || req.body.LabInv,
      labResults: req.body.labResults,
      procedures: req.body.procedures,
      followUp: req.body.followUp || (req.body.followUps && req.body.followUps[0]),
      referral: req.body.referral || (req.body.referToDoctor && req.body.referToDoctor[0]),
      advice: Array.isArray(req.body.advices) ? req.body.advices.join('\n') : req.body.advice,
      notes: req.body.notes,
      customSections: req.body.customSections,
      sectionConfig: req.body.sectionConfig,
      language: req.body.language,
      isEdited: true,
    };

    // Remove undefined keys
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    const prescription = await Prescription.findOneAndUpdate(
      { prescriptionId },
      { $set: updateData },
      { new: true }
    );

    if (!prescription) {
      return res.status(404).json({
        success: false,
        error: { code: 'PRESCRIPTION_NOT_FOUND', message: 'Prescription not found' },
      });
    }

    res.json({
      success: true,
      data: prescription,
      message: 'Prescription updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getFullPrescription = async (req, res, next) => {
  try {
    const prescriptionId = req.query.prescription_id || req.query.prescriptionId;

    if (!prescriptionId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'prescription_id is required' },
      });
    }

    const prescription = await Prescription.findOne({ prescriptionId });

    if (!prescription) {
      return res.status(404).json({
        success: false,
        error: { code: 'PRESCRIPTION_NOT_FOUND', message: 'Prescription not found' },
      });
    }

    res.json({
      success: true,
      data: prescription,
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientPrescriptions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, startDate, endDate } = req.query;

    const filter = { patientId: req.params.patientId };

    if (startDate || endDate) {
      filter.visitDate = {};
      if (startDate) filter.visitDate.$gte = new Date(startDate);
      if (endDate) filter.visitDate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [prescriptions, total] = await Promise.all([
      Prescription.find(filter).sort({ visitDate: -1 }).skip(skip).limit(parseInt(limit)),
      Prescription.countDocuments(filter),
    ]);

    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);
    res.json({
      success: true,
      data: prescriptions,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Dropdown Options ────────────────────────────────────────────────
export const getDropdownOptions = async (req, res, next) => {
  try {
    const options = await DropdownOption.find({ is_active: true }).sort({ sort_order: 1 });

    const grouped = {};
    for (const opt of options) {
      if (!grouped[opt.section]) grouped[opt.section] = {};
      if (!grouped[opt.section][opt.option_key]) grouped[opt.section][opt.option_key] = [];
      grouped[opt.section][opt.option_key].push({
        dropdown_option_id: opt.dropdown_option_id,
        option_value: opt.option_value,
        option_key: opt.option_key,
      });
    }

    res.json({ success: true, data: grouped });
  } catch (error) {
    next(error);
  }
};

// ─── Unified Search ──────────────────────────────────────────────────
const CATEGORY_MODEL_MAP = {
  symptoms: { model: MasterSymptom, nameField: 'name' },
  diagnoses: { model: MasterDiagnosis, nameField: 'description' },
  medications: { model: MasterMedication, nameField: 'brandName' },
  lab_investigations: { model: MasterLabTest, nameField: 'name' },
  labtests: { model: MasterLabTest, nameField: 'name' },
  labresults: { model: MasterLabTest, nameField: 'name' },
  examination_findings: { model: MasterExaminationFinding, nameField: 'name' },
  procedures: { model: MasterProcedure, nameField: 'name' },
};

export const searchPrescriptionItems = async (req, res, next) => {
  try {
    const { search = '', category = 'symptoms', limit: qLimit = '6', offset: qOffset = '0' } = req.query;
    const limit = parseInt(qLimit);
    const offset = parseInt(qOffset);

    const categoryConfig = CATEGORY_MODEL_MAP[category];
    if (!categoryConfig) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CATEGORY', message: `Invalid category: ${category}` },
      });
    }

    const { model, nameField } = categoryConfig;
    const filter = search ? { [nameField]: { $regex: search, $options: 'i' } } : {};

    const [items, total] = await Promise.all([
      model.find(filter).skip(offset).limit(limit + 1).lean(),
      model.countDocuments(filter),
    ]);

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;

    res.json({
      success: true,
      data,
      has_more: hasMore,
      next_offset: hasMore ? offset + limit : null,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Frequently Seen ─────────────────────────────────────────────────
const CATEGORY_FIELD_MAP = {
  symptoms: 'symptoms',
  diagnoses: 'diagnoses',
  medications: 'medications',
  lab_investigations: 'labInvestigations',
  labtests: 'labInvestigations',
  labresults: 'labResults',
  examination_findings: 'examinationFindings',
  procedures: 'procedures',
};

const CATEGORY_NAME_FIELD = {
  symptoms: 'name',
  diagnoses: 'description',
  medications: 'brandName',
  lab_investigations: 'testName',
  labtests: 'testName',
  labresults: 'testName',
  examination_findings: 'name',
  procedures: 'name',
};

export const getFrequentlySeen = async (req, res, next) => {
  try {
    const {
      category = 'symptoms',
      doctor_id,
      organization_id,
      branch_id,
      organizationId,
      branchId,
      doctorId,
    } = req.query;

    const docId = doctor_id || doctorId || req.user?.userId;
    const orgId = organization_id || organizationId || req.user?.organizationId;
    const brId = branch_id || branchId || req.user?.branchId;

    const arrayField = CATEGORY_FIELD_MAP[category];
    if (!arrayField) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CATEGORY', message: `Invalid category: ${category}` },
      });
    }

    const nameField = CATEGORY_NAME_FIELD[category];

    const filter = {};
    if (docId) filter.doctorId = docId;
    if (orgId) filter.organizationId = orgId;
    if (brId) filter.branchId = brId;

    const prescriptions = await Prescription.find(filter)
      .sort({ visitDate: -1 })
      .limit(50)
      .select(arrayField)
      .lean();

    const countMap = {};
    for (const rx of prescriptions) {
      const items = rx[arrayField] || [];
      for (const item of items) {
        const name = item[nameField] || item.name || item.brandName || item.testName || '';
        if (name) {
          if (!countMap[name]) countMap[name] = { ...item, _count: 0 };
          countMap[name]._count++;
        }
      }
    }

    const sorted = Object.values(countMap)
      .sort((a, b) => b._count - a._count)
      .slice(0, 10)
      .map(({ _count, ...item }) => item);

    res.json({ success: true, data: sorted });
  } catch (error) {
    next(error);
  }
};

// ─── Configuration ───────────────────────────────────────────────────
export const getConfiguration = async (req, res, next) => {
  try {
    const {
      organization_id, branch_id, doctor_id,
      organizationId, branchId, doctorId,
    } = req.query;

    const orgId = organization_id || organizationId || req.user?.organizationId;
    const brId = branch_id || branchId || req.user?.branchId;
    const docId = doctor_id || doctorId || req.user?.userId;

    const config = await PrescriptionConfig.findOne({
      organizationId: orgId,
      branchId: brId,
      doctorId: docId,
    });

    if (config) {
      return res.json({ success: true, data: config });
    }

    // Return defaults
    res.json({
      success: true,
      data: {
        section_order: [
          'vitals', 'symptoms', 'diagnosis', 'examination',
          'medications', 'labInvestigations', 'labResults', 'medicalHistory',
          'procedures', 'followUp', 'referral', 'advice', 'notes', 'customSections',
        ],
        enabled_sections: {
          vitals: true, symptoms: true, diagnosis: true, examination: true,
          medications: true, labInvestigations: true, labResults: true, medicalHistory: true,
          procedures: true, followUp: true, referral: true, advice: true, notes: true, customSections: true,
        },
        print_enabled_sections: {
          vitals: true, symptoms: true, diagnosis: true,
          medications: true, labInvestigations: true, procedures: true, followUp: true, advice: true,
        },
        custom_sections: [],
      },
    });
  } catch (error) {
    next(error);
  }
};

export const upsertConfiguration = async (req, res, next) => {
  try {
    const orgId = req.body.organization_id || req.body.organizationId || req.user?.organizationId;
    const brId = req.body.branch_id || req.body.branchId || req.user?.branchId;
    const docId = req.body.doctor_id || req.body.doctorId || req.user?.userId;

    const updateData = {};
    if (req.body.section_order) updateData.section_order = req.body.section_order;
    if (req.body.enabled_sections) updateData.enabled_sections = req.body.enabled_sections;
    if (req.body.print_enabled_sections) updateData.print_enabled_sections = req.body.print_enabled_sections;
    if (req.body.custom_sections) updateData.custom_sections = req.body.custom_sections;

    const config = await PrescriptionConfig.findOneAndUpdate(
      { organizationId: orgId, branchId: brId, doctorId: docId },
      { $set: updateData, $setOnInsert: { organizationId: orgId, branchId: brId, doctorId: docId } },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: config,
      message: 'Configuration saved successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ─── Patient Detail + History (for prescription pad) ─────────────────
export const getPatientDetailHistory = async (req, res, next) => {
  try {
    const patientId = req.query.id || req.params.id;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Patient id is required' },
      });
    }

    const patient = await Patient.findOne({ patientId, isActive: true }).lean();
    if (!patient) {
      return res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' },
      });
    }

    const [medicalHistory, lastPrescription] = await Promise.all([
      PatientMedicalHistory.findOne({ patientId }).lean(),
      Prescription.findOne({ patientId }).sort({ visitDate: -1 }).select('vitals visitDate').lean(),
    ]);

    // Build age display
    let ageDisplay = '';
    if (patient.dateOfBirth) {
      const now = new Date();
      const dob = new Date(patient.dateOfBirth);
      const diffMs = now - dob;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays < 30) {
        ageDisplay = `${diffDays}d`;
      } else if (diffDays < 730) {
        ageDisplay = `${Math.floor(diffDays / 30)}m`;
      } else {
        ageDisplay = `${Math.floor(diffDays / 365)}y`;
      }
    } else if (patient.age) {
      ageDisplay = `${patient.age}y`;
    }

    const genderMap = { M: 'Male', F: 'Female', Other: 'Other' };

    const addressParts = [];
    if (patient.address) {
      if (patient.address.street) addressParts.push(patient.address.street);
      if (patient.address.city) addressParts.push(patient.address.city);
      if (patient.address.state) addressParts.push(patient.address.state);
      if (patient.address.pincode) addressParts.push(patient.address.pincode);
    }

    res.json({
      success: true,
      data: {
        fullName: `${patient.salutation ? patient.salutation + '. ' : ''}${patient.name}`,
        ageDisplay,
        genderDisplay: genderMap[patient.gender] || patient.gender,
        phoneDisplay: patient.phone,
        rawData: {
          address: addressParts.join(', '),
          ...patient,
        },
        lockedVitals: lastPrescription?.vitals || null,
        medicalHistory: medicalHistory?.conditions || [],
        lastVisitDate: lastPrescription?.visitDate || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Vitals Units ────────────────────────────────────────────────────
export const getVitalUnits = async (req, res, next) => {
  try {
    const units = {
      pulse: [
        { unit_id: 1, unit_name: 'bpm', is_default: true },
      ],
      blood_pressure: [
        { unit_id: 2, unit_name: 'mmHg', is_default: true },
      ],
      respiratory_rate: [
        { unit_id: 3, unit_name: 'breaths/min', is_default: true },
      ],
      temperature: [
        { unit_id: 4, unit_name: '°F', is_default: true },
        { unit_id: 5, unit_name: '°C', is_default: false },
      ],
      height: [
        { unit_id: 6, unit_name: 'cm', is_default: true },
        { unit_id: 7, unit_name: 'ft', is_default: false },
      ],
      muscle_mass: [
        { unit_id: 8, unit_name: 'kg', is_default: true },
        { unit_id: 9, unit_name: 'lbs', is_default: false },
      ],
      head_circumference: [
        { unit_id: 10, unit_name: 'cm', is_default: true },
      ],
      chest_circumference: [
        { unit_id: 11, unit_name: 'cm', is_default: true },
      ],
      mid_arm_circumference: [
        { unit_id: 12, unit_name: 'cm', is_default: true },
      ],
      waist_circumference: [
        { unit_id: 13, unit_name: 'cm', is_default: true },
      ],
    };

    res.json({ success: true, data: { units } });
  } catch (error) {
    next(error);
  }
};
