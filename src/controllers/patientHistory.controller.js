import { query, withTransaction } from '../config/mysql.js';
import { mapPatientRow } from '../db/mappers/patient.mapper.js';
import { mapPatientHistoryRow } from '../db/mappers/patientHistory.mapper.js';
import { upsertMedicalHistoryMysql } from './patients.controller.js';

async function loadHistoryMysql(patientId) {
  const [[hrow]] = await query(
    'SELECT * FROM patient_medical_history WHERE patient_id = ? LIMIT 1',
    [patientId]
  );
  if (!hrow) return null;
  const [cRows] = await query('SELECT * FROM patient_medical_conditions WHERE history_id = ?', [hrow.history_id]);
  const [aRows] = await query('SELECT * FROM patient_allergies WHERE history_id = ?', [hrow.history_id]);
  const [sRows] = await query('SELECT * FROM patient_surgical_history WHERE history_id = ?', [hrow.history_id]);
  const [fRows] = await query('SELECT * FROM patient_family_history WHERE history_id = ?', [hrow.history_id]);
  return mapPatientHistoryRow(hrow, cRows, aRows, sRows, fRows);
}

export const getPatientHistory = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    const [[row]] = await query(
      'SELECT * FROM patient WHERE patient_id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1',
      [patientId]
    );
    if (!row) {
      return res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' },
      });
    }
    const [tagRows] = await query('SELECT tag FROM patient_tags WHERE patient_id = ?', [patientId]);
    const patient = mapPatientRow(row, tagRows);
    const medicalHistory = await loadHistoryMysql(patientId);

    const [[lastRx]] = await query(
      'SELECT prescription_id, visit_date FROM prescription WHERE patient_id = ? AND deleted_at IS NULL ORDER BY visit_date DESC LIMIT 1',
      [patientId]
    );
    let lockedVitals = null;
    let lastVisitDate = null;
    if (lastRx) {
      const [vRows] = await query(
        'SELECT * FROM prescription_vitals WHERE prescription_id = ?',
        [lastRx.prescription_id]
      );
      lockedVitals = {};
      for (const v of vRows) {
        if (v.unit || v.is_locked === 1) {
          lockedVitals[v.vital_name] = { value: v.value_text, unit: v.unit || null, is_locked: v.is_locked === 1 };
        } else {
          lockedVitals[v.vital_name] = v.value_text;
        }
      }
      lastVisitDate = lastRx.visit_date ? new Date(lastRx.visit_date).toISOString() : null;
    }

    return res.json({
      success: true,
      data: { patient, medicalHistory, lockedVitals, lastVisitDate },
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

    let existed;
    await withTransaction(async (conn) => {
      const [[pre]] = await conn.query(
        'SELECT history_id FROM patient_medical_history WHERE patient_id = ? LIMIT 1',
        [patientId]
      );
      existed = !!pre;
      await upsertMedicalHistoryMysql(conn, patientId, req.body, req.user?.userId);
    });
    const data = await loadHistoryMysql(patientId);
    if (existed) {
      return res.json({ success: true, data, message: 'Medical history updated (existing record)' });
    }
    return res.status(201).json({ success: true, data, message: 'Medical history created successfully' });
  } catch (error) {
    next(error);
  }
};

export const updatePatientHistory = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    await withTransaction(async (conn) => {
      await upsertMedicalHistoryMysql(conn, patientId, req.body, req.user?.userId);
    });
    const data = await loadHistoryMysql(patientId);
    return res.json({ success: true, data, message: 'Medical history updated successfully' });
  } catch (error) {
    next(error);
  }
};
