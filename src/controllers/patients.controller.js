import Patient from '../models/Patient.js';
import PatientMedicalHistory from '../models/PatientMedicalHistory.js';
import Prescription from '../models/Prescription.js';

export const searchPatients = async (req, res, next) => {
  try {
    const q = req.query.q || req.query.search || '';
    const orgId = req.query.organizationId || req.user?.organizationId;

    const filter = { isActive: true };
    if (orgId) filter.organizationId = orgId;

    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { uhid: { $regex: q, $options: 'i' } },
      ];
    }

    const patients = await Patient.find(filter)
      .select('patientId name phone uhid gender age')
      .sort({ name: 1 })
      .limit(20)
      .lean();

    res.json({ success: true, data: patients });
  } catch (error) {
    next(error);
  }
};

export const getPatients = async (req, res, next) => {
  try {
    const { search, startDate, endDate, page = 1, limit = 50 } = req.query;
    const organizationId = req.query.organizationId || req.user?.organizationId;
    const branchId = req.query.branchId || req.user?.branchId;

    const filter = { isActive: true };
    if (organizationId) filter.organizationId = organizationId;
    if (branchId) filter.branchId = branchId;

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { uhid: { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [patients, total] = await Promise.all([
      Patient.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Patient.countDocuments(filter),
    ]);

    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);
    res.json({
      success: true,
      data: { patients, total, page: parsedPage, limit: parsedLimit },
    });
  } catch (error) {
    next(error);
  }
};

export const createPatient = async (req, res, next) => {
  try {
    const organizationId = req.body.organizationId || req.user?.organizationId;
    const branchId = req.body.branchId || req.user?.branchId;
    const { phone } = req.body;

    // Inject org/branch into body so they get saved
    req.body.organizationId = organizationId;
    req.body.branchId = branchId;

    const existingPatient = await Patient.findOne({ organizationId, phone, isActive: true });
    if (existingPatient) {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_PHONE', message: 'A patient with this phone number already exists' },
      });
    }

    const count = await Patient.countDocuments({ organizationId });
    const uhid = `UHID${String(count + 1).padStart(5, '0')}`;

    const patient = new Patient({
      ...req.body,
      uhid,
      createdBy: req.user?.userId,
    });

    await patient.save();

    res.status(201).json({
      success: true,
      data: { patientId: patient.patientId, uhid: patient.uhid },
      message: 'Patient created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientById = async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ patientId: req.params.patientId, isActive: true });

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' },
      });
    }

    const medicalHistory = await PatientMedicalHistory.findOne({ patientId: req.params.patientId });

    res.json({
      success: true,
      data: { ...patient.toObject(), medicalHistory },
    });
  } catch (error) {
    next(error);
  }
};

export const updatePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findOneAndUpdate(
      { patientId: req.params.patientId, isActive: true },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' },
      });
    }

    res.json({
      success: true,
      data: patient,
      message: 'Patient updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const deletePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findOneAndUpdate(
      { patientId: req.params.patientId },
      { isActive: false },
      { new: true }
    );

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' },
      });
    }

    res.json({
      success: true,
      message: 'Patient deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientPrescriptions = async (req, res, next) => {
  try {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;

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
