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

// ─── Bulk Import ────────────────────────────────────────────────────

const BULK_IMPORT_TYPE_MAP = {
  medication: { model: MasterMedication, required: ['brandName'] },
  diagnosis: { model: MasterDiagnosis, required: ['icdCode', 'description'] },
  symptom: { model: MasterSymptom, required: ['name'] },
  examination_finding: { model: MasterExaminationFinding, required: ['name'] },
  lab_test: { model: MasterLabTest, required: ['name'] },
  lab_result: { model: MasterLabTest, required: ['name'] },
};

export const bulkImport = async (req, res, next) => {
  try {
    const { type, items } = req.body;

    if (!type || !BULK_IMPORT_TYPE_MAP[type]) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid type. Must be one of: ${Object.keys(BULK_IMPORT_TYPE_MAP).join(', ')}`,
        },
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'items must be a non-empty array',
        },
      });
    }

    const { model: Model, required: requiredFields } = BULK_IMPORT_TYPE_MAP[type];

    const validItems = [];
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const missingFields = requiredFields.filter(f => !item[f] || (typeof item[f] === 'string' && item[f].trim() === ''));
      if (missingFields.length > 0) {
        errors.push({ index: i, error: `Missing required fields: ${missingFields.join(', ')}` });
      } else {
        validItems.push({ ...item, _originalIndex: i });
      }
    }

    let inserted = 0;

    if (validItems.length > 0) {
      const docsToInsert = validItems.map(({ _originalIndex, ...rest }) => rest);

      try {
        const result = await Model.insertMany(docsToInsert, { ordered: false });
        inserted = result.length;
      } catch (err) {
        if (err.code === 11000 || (err.writeErrors && err.writeErrors.length > 0)) {
          inserted = err.insertedDocs?.length ?? (validItems.length - (err.writeErrors?.length ?? 0));
          if (inserted < 0) inserted = 0;

          for (const writeErr of (err.writeErrors || [])) {
            const validIdx = writeErr.index;
            const originalIdx = validItems[validIdx]?._originalIndex ?? validIdx;
            const msg = writeErr.errmsg?.includes('duplicate key')
              ? 'Duplicate entry'
              : (writeErr.errmsg || 'Insert failed');
            errors.push({ index: originalIdx, error: msg });
          }
        } else {
          throw err;
        }
      }
    }

    const failed = items.length - inserted;

    res.json({
      success: true,
      data: { inserted, failed, errors },
      message: `Bulk import completed: ${inserted} inserted, ${failed} failed`,
    });
  } catch (error) {
    next(error);
  }
};
