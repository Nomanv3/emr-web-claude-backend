import MasterSymptom from '../models/MasterSymptom.js';
import MasterDiagnosis from '../models/MasterDiagnosis.js';
import MasterMedication from '../models/MasterMedication.js';
import MasterLabTest from '../models/MasterLabTest.js';
import MasterService from '../models/MasterService.js';
import MasterExaminationFinding from '../models/MasterExaminationFinding.js';
import MasterProcedure from '../models/MasterProcedure.js';
import MasterSalutation from '../models/MasterSalutation.js';

export const searchSymptoms = async (req, res, next) => {
  try {
    const { search } = req.query;
    const filter = search ? { name: { $regex: search, $options: 'i' } } : {};
    const symptoms = await MasterSymptom.find(filter).limit(50).sort({ name: 1 });
    res.json({ success: true, data: { symptoms } });
  } catch (error) {
    next(error);
  }
};

export const searchDiagnoses = async (req, res, next) => {
  try {
    const { search } = req.query;
    const filter = search
      ? { $or: [
          { description: { $regex: search, $options: 'i' } },
          { icdCode: { $regex: search, $options: 'i' } },
        ]}
      : {};
    const diagnoses = await MasterDiagnosis.find(filter).limit(50).sort({ description: 1 });
    res.json({ success: true, data: { diagnoses } });
  } catch (error) {
    next(error);
  }
};

export const searchMedications = async (req, res, next) => {
  try {
    const { search } = req.query;
    const filter = search
      ? { $or: [
          { brandName: { $regex: search, $options: 'i' } },
          { genericName: { $regex: search, $options: 'i' } },
        ]}
      : {};
    const medications = await MasterMedication.find(filter).limit(50).sort({ brandName: 1 });
    res.json({ success: true, data: { medications } });
  } catch (error) {
    next(error);
  }
};

export const searchLabTests = async (req, res, next) => {
  try {
    const { search } = req.query;
    const filter = search ? { name: { $regex: search, $options: 'i' } } : {};
    const labTests = await MasterLabTest.find(filter).limit(50).sort({ name: 1 });
    res.json({ success: true, data: { labTests } });
  } catch (error) {
    next(error);
  }
};

export const getServices = async (req, res, next) => {
  try {
    const { organizationId, search } = req.query;
    const filter = { isActive: true };
    if (organizationId) filter.organizationId = organizationId;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }
    const services = await MasterService.find(filter).limit(50).sort({ name: 1 });
    res.json({ success: true, data: { services } });
  } catch (error) {
    next(error);
  }
};

export const createService = async (req, res, next) => {
  try {
    const { name, price, description, category } = req.body;
    const organizationId = req.body.organizationId || req.user?.organizationId;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Service name is required' },
      });
    }

    const service = new MasterService({
      organizationId,
      name,
      category: category || 'General',
      defaultPrice: price || 0,
      description: description || '',
      isActive: true,
    });

    await service.save();

    res.status(201).json({
      success: true,
      data: { service },
      message: 'Service created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const searchExaminationFindings = async (req, res, next) => {
  try {
    const { search } = req.query;
    const filter = search ? { name: { $regex: search, $options: 'i' } } : {};
    const findings = await MasterExaminationFinding.find(filter).limit(50).sort({ name: 1 });
    res.json({ success: true, data: { findings } });
  } catch (error) {
    next(error);
  }
};

export const searchProcedures = async (req, res, next) => {
  try {
    const { search } = req.query;
    const filter = search ? { name: { $regex: search, $options: 'i' } } : {};
    const procedures = await MasterProcedure.find(filter).limit(50).sort({ name: 1 });
    res.json({ success: true, data: { procedures } });
  } catch (error) {
    next(error);
  }
};

export const getSalutations = async (req, res, next) => {
  try {
    const salutations = await MasterSalutation.find().sort({ label: 1 });
    res.json({ success: true, data: { salutations } });
  } catch (error) {
    next(error);
  }
};
