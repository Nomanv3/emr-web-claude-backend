import { query, execute, withTransaction } from '../config/mysql.js';
import {
  mapSymptomRow,
  mapDiagnosisRow,
  mapMedicationRow,
  mapLabTestRow,
  mapFindingRow,
  mapProcedureRow,
  mapSalutationRow,
  mapServiceRow,
} from '../db/mappers/masters.mapper.js';
import { v4 as uuidv4 } from 'uuid';

export const searchSymptoms = async (req, res, next) => {
  try {
    const { search } = req.query;
    const [rows] = search
      ? await query(
          'SELECT * FROM master_symptom WHERE name LIKE ? ORDER BY name LIMIT 50',
          [`%${search}%`]
        )
      : await query('SELECT * FROM master_symptom ORDER BY name LIMIT 50');
    return res.json({ success: true, data: { symptoms: rows.map(mapSymptomRow) } });
  } catch (error) {
    next(error);
  }
};

export const searchDiagnoses = async (req, res, next) => {
  try {
    const { search } = req.query;
    const [rows] = search
      ? await query(
          'SELECT * FROM master_diagnosis WHERE description LIKE ? OR icd_code LIKE ? ORDER BY description LIMIT 50',
          [`%${search}%`, `%${search}%`]
        )
      : await query('SELECT * FROM master_diagnosis ORDER BY description LIMIT 50');
    return res.json({ success: true, data: { diagnoses: rows.map(mapDiagnosisRow) } });
  } catch (error) {
    next(error);
  }
};

export const searchMedications = async (req, res, next) => {
  try {
    const { search } = req.query;
    const [rows] = search
      ? await query(
          'SELECT * FROM master_medication WHERE brand_name LIKE ? OR generic_name LIKE ? ORDER BY brand_name LIMIT 50',
          [`%${search}%`, `%${search}%`]
        )
      : await query('SELECT * FROM master_medication ORDER BY brand_name LIMIT 50');
    return res.json({ success: true, data: { medications: rows.map(mapMedicationRow) } });
  } catch (error) {
    next(error);
  }
};

export const searchLabTests = async (req, res, next) => {
  try {
    const { search } = req.query;
    const [rows] = search
      ? await query(
          'SELECT * FROM master_lab_test WHERE name LIKE ? ORDER BY name LIMIT 50',
          [`%${search}%`]
        )
      : await query('SELECT * FROM master_lab_test ORDER BY name LIMIT 50');
    return res.json({ success: true, data: { labTests: rows.map(mapLabTestRow) } });
  } catch (error) {
    next(error);
  }
};

export const getServices = async (req, res, next) => {
  try {
    const { organizationId, search } = req.query;
    let sql = 'SELECT * FROM master_service WHERE is_active = 1';
    const params = [];
    if (organizationId) {
      sql += ' AND organization_id = ?';
      params.push(organizationId);
    }
    if (search) {
      sql += ' AND (name LIKE ? OR category LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY name LIMIT 50';
    const [rows] = await query(sql, params);
    return res.json({ success: true, data: { services: rows.map(mapServiceRow) } });
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

    const serviceId = uuidv4();
    await execute(
      `INSERT INTO master_service
         (service_id, organization_id, name, category, default_price, description, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [serviceId, organizationId, name, category || 'General', price || 0, description || '']
    );
    const [[row]] = await query('SELECT * FROM master_service WHERE service_id = ?', [serviceId]);
    return res.status(201).json({
      success: true,
      data: { service: mapServiceRow(row) },
      message: 'Service created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const searchExaminationFindings = async (req, res, next) => {
  try {
    const { search } = req.query;
    const [rows] = search
      ? await query(
          'SELECT * FROM master_examination_finding WHERE name LIKE ? ORDER BY name LIMIT 50',
          [`%${search}%`]
        )
      : await query('SELECT * FROM master_examination_finding ORDER BY name LIMIT 50');
    return res.json({ success: true, data: { findings: rows.map(mapFindingRow) } });
  } catch (error) {
    next(error);
  }
};

export const searchProcedures = async (req, res, next) => {
  try {
    const { search } = req.query;
    const [rows] = search
      ? await query(
          'SELECT * FROM master_procedure WHERE name LIKE ? ORDER BY name LIMIT 50',
          [`%${search}%`]
        )
      : await query('SELECT * FROM master_procedure ORDER BY name LIMIT 50');
    return res.json({ success: true, data: { procedures: rows.map(mapProcedureRow) } });
  } catch (error) {
    next(error);
  }
};

export const getSalutations = async (req, res, next) => {
  try {
    const [rows] = await query('SELECT * FROM master_salutation ORDER BY label');
    return res.json({ success: true, data: { salutations: rows.map(mapSalutationRow) } });
  } catch (error) {
    next(error);
  }
};

// ─── Bulk Import ────────────────────────────────────────────────────

const BULK_IMPORT_TYPE_MAP = {
  medication: { required: ['brandName'] },
  diagnosis: { required: ['icdCode', 'description'] },
  symptom: { required: ['name'] },
  examination_finding: { required: ['name'] },
  lab_test: { required: ['name'] },
  lab_result: { required: ['name'] },
};

// MySQL table + INSERT builder per bulk-import type.
const MYSQL_BULK_MAP = {
  symptom: {
    table: 'master_symptom',
    idCol: 'symptom_id',
    required: ['name'],
    buildRow: (item, id) => ({
      symptom_id: id,
      name: item.name,
      category: item.category || null,
      icd_mapping: item.icdMapping || item.icd_mapping || null,
    }),
  },
  diagnosis: {
    table: 'master_diagnosis',
    idCol: 'diagnosis_id',
    required: ['icdCode', 'description'],
    buildRow: (item, id) => ({
      diagnosis_id: id,
      icd_code: item.icdCode || item.icd_code,
      description: item.description,
      category: item.category || null,
    }),
  },
  medication: {
    table: 'master_medication',
    idCol: 'medication_id',
    required: ['brandName'],
    buildRow: (item, id) => ({
      medication_id: id,
      brand_name: item.brandName || item.brand_name,
      generic_name: item.genericName || item.generic_name || null,
      form: item.form || null,
      strength: item.strength || null,
      manufacturer: item.manufacturer || null,
    }),
  },
  examination_finding: {
    table: 'master_examination_finding',
    idCol: 'finding_id',
    required: ['name'],
    buildRow: (item, id) => ({
      finding_id: id,
      name: item.name,
      category: item.category || null,
    }),
  },
  lab_test: {
    table: 'master_lab_test',
    idCol: 'test_id',
    required: ['name'],
    buildRow: (item, id) => ({
      test_id: id,
      name: item.name,
      category: item.category || null,
      normal_range: item.normalRange || item.normal_range || null,
      unit: item.unit || null,
    }),
  },
  lab_result: {
    table: 'master_lab_test',
    idCol: 'test_id',
    required: ['name'],
    buildRow: (item, id) => ({
      test_id: id,
      name: item.name,
      category: item.category || null,
      normal_range: item.normalRange || item.normal_range || null,
      unit: item.unit || null,
    }),
  },
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

    const mysqlCfg = MYSQL_BULK_MAP[type];
    const { required: requiredFields } = BULK_IMPORT_TYPE_MAP[type];

    const validItems = [];
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const missingFields = requiredFields.filter(
        (f) => !item[f] || (typeof item[f] === 'string' && item[f].trim() === '')
      );
      if (missingFields.length > 0) {
        errors.push({ index: i, error: `Missing required fields: ${missingFields.join(', ')}` });
      } else {
        validItems.push({ ...item, _originalIndex: i });
      }
    }

    let inserted = 0;

    for (let vi = 0; vi < validItems.length; vi++) {
      const { _originalIndex, ...item } = validItems[vi];
      const id = uuidv4();
      const row = mysqlCfg.buildRow(item, id);
      const cols = Object.keys(row);
      const placeholders = cols.map(() => '?').join(', ');
      const vals = cols.map((c) => row[c]);

      try {
        await execute(
          `INSERT INTO \`${mysqlCfg.table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${placeholders})`,
          vals
        );
        inserted++;
      } catch (err) {
        const msg =
          err.code === 'ER_DUP_ENTRY' ? 'Duplicate entry' : err.message || 'Insert failed';
        errors.push({ index: _originalIndex, error: msg });
      }
    }

    const failed = items.length - inserted;
    return res.json({
      success: true,
      data: { inserted, failed, errors },
      message: `Bulk import completed: ${inserted} inserted, ${failed} failed`,
    });
  } catch (error) {
    next(error);
  }
};
