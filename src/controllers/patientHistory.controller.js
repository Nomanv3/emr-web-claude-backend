import Patient from '../models/Patient.js';
import PatientMedicalHistory from '../models/PatientMedicalHistory.js';
import Prescription from '../models/Prescription.js';

export const getPatientHistory = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    const patient = await Patient.findOne({ patientId, isActive: true });
    if (!patient) {
      return res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' },
      });
    }

    const medicalHistory = await PatientMedicalHistory.findOne({ patientId });

    const lastPrescription = await Prescription.findOne({ patientId })
      .sort({ visitDate: -1 })
      .select('vitals visitDate');

    res.json({
      success: true,
      data: {
        patient,
        medicalHistory,
        lockedVitals: lastPrescription?.vitals || null,
        lastVisitDate: lastPrescription?.visitDate || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createPatientHistory = async (req, res, next) => {
  try {
    const { patientId } = req.body;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'patientId is required' },
      });
    }

    const existing = await PatientMedicalHistory.findOne({ patientId });
    if (existing) {
      // Upsert: update the existing record
      Object.assign(existing, req.body, { updatedBy: req.user?.userId });
      await existing.save();
      return res.json({
        success: true,
        data: existing,
        message: 'Medical history updated (existing record)',
      });
    }

    const medicalHistory = new PatientMedicalHistory({
      ...req.body,
      updatedBy: req.user?.userId,
    });
    await medicalHistory.save();

    res.status(201).json({
      success: true,
      data: medicalHistory,
      message: 'Medical history created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const updatePatientHistory = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    let medicalHistory = await PatientMedicalHistory.findOne({ patientId });

    if (medicalHistory) {
      Object.assign(medicalHistory, req.body, { updatedBy: req.user?.userId });
      await medicalHistory.save();
    } else {
      medicalHistory = new PatientMedicalHistory({
        patientId,
        ...req.body,
        updatedBy: req.user?.userId,
      });
      await medicalHistory.save();
    }

    res.json({
      success: true,
      data: medicalHistory,
      message: 'Medical history updated successfully',
    });
  } catch (error) {
    next(error);
  }
};
