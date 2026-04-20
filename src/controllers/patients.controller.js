import { query, withTransaction } from '../config/mysql.js';
import { mapPatientRow, mapPatientSearchRow } from '../db/mappers/patient.mapper.js';
import { mapPatientHistoryRow } from '../db/mappers/patientHistory.mapper.js';
import { mapPrescriptionRow } from '../db/mappers/prescription.mapper.js';
import { v4 as uuidv4 } from 'uuid';

// ───────────────────────────────────────────────────────────────────────────
// MySQL helpers for patient_medical_history upsert (shared by createPatient
// and patientHistory.controller). Uses the same flatten logic as migration.
// ───────────────────────────────────────────────────────────────────────────
async function upsertMedicalHistoryMysql(conn, patientId, medicalHistory, userId) {
  const conditions = medicalHistory?.conditions || [];
  const allergies  = medicalHistory?.allergies || [];
  const surgical   = medicalHistory?.surgicalHistory || [];
  const family     = medicalHistory?.familyHistory || [];
  const noHistory  = medicalHistory?.noHistory || medicalHistory?.noRelevantHistory ? 1 : 0;

  // Look up existing history_id for this patient
  const [existing] = await conn.query(
    'SELECT history_id FROM patient_medical_history WHERE patient_id = ? LIMIT 1',
    [patientId]
  );
  let historyId;
  if (existing.length) {
    historyId = existing[0].history_id;
    await conn.query(
      'UPDATE patient_medical_history SET no_history = ?, updated_by = ? WHERE history_id = ?',
      [noHistory, userId || null, historyId]
    );
    // Wipe children before re-inserting (same pattern as migration scripts)
    await conn.query('DELETE FROM patient_medical_conditions WHERE history_id = ?', [historyId]);
    await conn.query('DELETE FROM patient_allergies WHERE history_id = ?', [historyId]);
    await conn.query('DELETE FROM patient_surgical_history WHERE history_id = ?', [historyId]);
    await conn.query('DELETE FROM patient_family_history WHERE history_id = ?', [historyId]);
  } else {
    historyId = uuidv4();
    await conn.query(
      'INSERT INTO patient_medical_history (history_id, patient_id, no_history, updated_by) VALUES (?, ?, ?, ?)',
      [historyId, patientId, noHistory, userId || null]
    );
  }

  for (const c of conditions) {
    await conn.query(
      'INSERT INTO patient_medical_conditions (history_id, name, value, since, notes) VALUES (?, ?, ?, ?, ?)',
      [historyId, c.name, c.value || '-', c.since || null, c.notes || null]
    );
  }
  for (const a of allergies) {
    await conn.query(
      'INSERT INTO patient_allergies (history_id, allergen, severity, reaction) VALUES (?, ?, ?, ?)',
      [historyId, a.allergen, a.severity || null, a.reaction || null]
    );
  }
  for (const s of surgical) {
    await conn.query(
      'INSERT INTO patient_surgical_history (history_id, procedure_name, procedure_date, notes) VALUES (?, ?, ?, ?)',
      [historyId, s.procedure, s.date ? new Date(s.date) : null, s.notes || null]
    );
  }
  for (const f of family) {
    await conn.query(
      'INSERT INTO patient_family_history (history_id, relation, condition_desc) VALUES (?, ?, ?)',
      [historyId, f.relation, f.condition]
    );
  }

  return historyId;
}

export { upsertMedicalHistoryMysql };

// ───────────────────────────────────────────────────────────────────────────
// Controllers
// ───────────────────────────────────────────────────────────────────────────

export const searchPatients = async (req, res, next) => {
  try {
    const q = req.query.q || req.query.search || '';
    const orgId = req.query.organizationId || req.user?.organizationId;

    const where = ['is_active = 1', 'deleted_at IS NULL'];
    const params = [];
    if (orgId) { where.push('organization_id = ?'); params.push(orgId); }
    if (q) {
      where.push('(name LIKE ? OR phone LIKE ? OR uhid LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const sql = `SELECT patient_id, name, phone, uhid, gender, age FROM patient WHERE ${where.join(' AND ')} ORDER BY name ASC LIMIT 20`;
    const [rows] = await query(sql, params);
    return res.json({ success: true, data: rows.map(mapPatientSearchRow) });
  } catch (error) {
    next(error);
  }
};

export const getPatients = async (req, res, next) => {
  try {
    const { search, startDate, endDate, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const organizationId = req.query.organizationId || req.user?.organizationId;
    const branchId = req.query.branchId || req.user?.branchId;
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);

    const where = ['is_active = 1', 'deleted_at IS NULL'];
    const params = [];
    if (organizationId) { where.push('organization_id = ?'); params.push(organizationId); }
    if (branchId) { where.push('branch_id = ?'); params.push(branchId); }
    if (search) {
      where.push('(name LIKE ? OR phone LIKE ? OR uhid LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    const fromDate = dateFrom || startDate;
    const toDate = dateTo || endDate;
    if (fromDate) { where.push('created_at >= ?'); params.push(new Date(fromDate)); }
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      where.push('created_at <= ?');
      params.push(end);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const offset = (parsedPage - 1) * parsedLimit;
    const [rows] = await query(
      `SELECT * FROM patient ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parsedLimit, offset]
    );
    const [[{ total }]] = await query(
      `SELECT COUNT(*) AS total FROM patient ${whereSql}`,
      params
    );

    // Bulk-load tags for all patients
    let patients;
    if (rows.length === 0) {
      patients = [];
    } else {
      const ids = rows.map((r) => r.patient_id);
      const placeholders = ids.map(() => '?').join(',');
      const [tagRows] = await query(
        `SELECT patient_id, tag FROM patient_tags WHERE patient_id IN (${placeholders})`,
        ids
      );
      const tagMap = {};
      for (const t of tagRows) (tagMap[t.patient_id] ||= []).push(t);
      patients = rows.map((r) => mapPatientRow(r, tagMap[r.patient_id] || []));
    }

    return res.json({
      success: true,
      data: { patients, total: Number(total), page: parsedPage, limit: parsedLimit },
    });
  } catch (error) {
    next(error);
  }
};

export const createPatient = async (req, res, next) => {
  try {
    const organizationId = req.body.organizationId || req.user?.organizationId;
    const branchId = req.body.branchId || req.user?.branchId;
    const { phone, medicalHistory } = req.body;
    delete req.body.medicalHistory;
    req.body.organizationId = organizationId;
    req.body.branchId = branchId;

    // Dup check
    const [[dup]] = await query(
      'SELECT patient_id FROM patient WHERE organization_id = ? AND phone = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1',
      [organizationId, phone]
    );
    if (dup) {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_PHONE', message: 'A patient with this phone number already exists' },
      });
    }

    const [[{ cnt }]] = await query(
      'SELECT COUNT(*) AS cnt FROM patient WHERE organization_id = ?',
      [organizationId]
    );
    const uhid = `UHID${String(Number(cnt) + 1).padStart(5, '0')}`;
    const patientId = uuidv4();
    const b = req.body;
    const addr = b.address || {};
    const dob = b.dateOfBirth ? new Date(b.dateOfBirth) : null;

    await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO patient
          (patient_id, uhid, organization_id, branch_id, salutation, name, gender, date_of_birth, age,
           phone, alternate_phone, email, address_street, address_city, address_state, address_country, address_pincode,
           blood_group, is_active, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          patientId, uhid, organizationId, branchId,
          b.salutation || null, b.name, b.gender,
          dob, b.age != null ? Number(b.age) : null,
          b.phone, b.alternatePhone || null, b.email || null,
          addr.street || null, addr.city || null, addr.state || null, addr.country || null, addr.pincode || null,
          b.bloodGroup || null,
          req.user?.userId || null,
        ]
      );
      for (const tag of b.tags || []) {
        await conn.query(
          'INSERT IGNORE INTO patient_tags (patient_id, tag) VALUES (?, ?)',
          [patientId, tag]
        );
      }
      // Medical history inline if provided
      if (medicalHistory) {
        await upsertMedicalHistoryMysql(conn, patientId, medicalHistory, req.user?.userId || 'system');
      }
    });

    return res.status(201).json({
      success: true,
      data: { patientId, uhid },
      message: 'Patient created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientById = async (req, res, next) => {
  try {
    const [[row]] = await query(
      'SELECT * FROM patient WHERE patient_id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1',
      [req.params.patientId]
    );
    if (!row) {
      return res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' },
      });
    }
    const [tagRows] = await query('SELECT tag FROM patient_tags WHERE patient_id = ?', [row.patient_id]);
    const patient = mapPatientRow(row, tagRows);

    // Medical history
    const [[hrow]] = await query(
      'SELECT * FROM patient_medical_history WHERE patient_id = ? LIMIT 1',
      [req.params.patientId]
    );
    let medicalHistory = null;
    if (hrow) {
      const [cRows] = await query('SELECT * FROM patient_medical_conditions WHERE history_id = ?', [hrow.history_id]);
      const [aRows] = await query('SELECT * FROM patient_allergies WHERE history_id = ?', [hrow.history_id]);
      const [sRows] = await query('SELECT * FROM patient_surgical_history WHERE history_id = ?', [hrow.history_id]);
      const [fRows] = await query('SELECT * FROM patient_family_history WHERE history_id = ?', [hrow.history_id]);
      medicalHistory = mapPatientHistoryRow(hrow, cRows, aRows, sRows, fRows);
    }
    return res.json({ success: true, data: { ...patient, medicalHistory } });
  } catch (error) {
    next(error);
  }
};

export const updatePatient = async (req, res, next) => {
  try {
    const b = req.body;
    const addr = b.address;
    const sets = [];
    const params = [];
    const map = {
      salutation: 'salutation', name: 'name', gender: 'gender',
      phone: 'phone', alternatePhone: 'alternate_phone', email: 'email',
      bloodGroup: 'blood_group', age: 'age',
    };
    for (const [k, col] of Object.entries(map)) {
      if (b[k] !== undefined) { sets.push(`${col} = ?`); params.push(b[k]); }
    }
    if (b.dateOfBirth !== undefined) {
      sets.push('date_of_birth = ?');
      params.push(b.dateOfBirth ? new Date(b.dateOfBirth) : null);
    }
    if (addr) {
      if (addr.street !== undefined)   { sets.push('address_street = ?');   params.push(addr.street); }
      if (addr.city !== undefined)     { sets.push('address_city = ?');     params.push(addr.city); }
      if (addr.state !== undefined)    { sets.push('address_state = ?');    params.push(addr.state); }
      if (addr.country !== undefined)  { sets.push('address_country = ?');  params.push(addr.country); }
      if (addr.pincode !== undefined)  { sets.push('address_pincode = ?');  params.push(addr.pincode); }
    }

    if (sets.length === 0 && !b.tags) {
      // Nothing to update
      const [[row]] = await query('SELECT * FROM patient WHERE patient_id = ? LIMIT 1', [req.params.patientId]);
      if (!row) return res.status(404).json({ success: false, error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
      const [tagRows] = await query('SELECT tag FROM patient_tags WHERE patient_id = ?', [row.patient_id]);
      return res.json({ success: true, data: mapPatientRow(row, tagRows), message: 'Patient updated successfully' });
    }

    await withTransaction(async (conn) => {
      if (sets.length) {
        const [r] = await conn.query(
          `UPDATE patient SET ${sets.join(', ')} WHERE patient_id = ? AND is_active = 1 AND deleted_at IS NULL`,
          [...params, req.params.patientId]
        );
        if (!r.affectedRows) {
          const err = new Error('PATIENT_NOT_FOUND');
          err.code = 'PATIENT_NOT_FOUND';
          throw err;
        }
      }
      if (Array.isArray(b.tags)) {
        await conn.query('DELETE FROM patient_tags WHERE patient_id = ?', [req.params.patientId]);
        for (const tag of b.tags) {
          await conn.query('INSERT IGNORE INTO patient_tags (patient_id, tag) VALUES (?, ?)', [req.params.patientId, tag]);
        }
      }
    }).catch((err) => {
      if (err.code === 'PATIENT_NOT_FOUND') return null;
      throw err;
    });

    const [[row]] = await query('SELECT * FROM patient WHERE patient_id = ? LIMIT 1', [req.params.patientId]);
    if (!row) {
      return res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' },
      });
    }
    const [tagRows] = await query('SELECT tag FROM patient_tags WHERE patient_id = ?', [row.patient_id]);
    return res.json({
      success: true,
      data: mapPatientRow(row, tagRows),
      message: 'Patient updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const deletePatient = async (req, res, next) => {
  try {
    const [r] = await query(
      'UPDATE patient SET is_active = 0 WHERE patient_id = ?',
      [req.params.patientId]
    );
    if (!r.affectedRows) {
      return res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' },
      });
    }
    return res.json({ success: true, message: 'Patient deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getPatientPrescriptions = async (req, res, next) => {
  try {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);

    const where = ['patient_id = ?', 'deleted_at IS NULL'];
    const params = [req.params.patientId];
    if (startDate) { where.push('visit_date >= ?'); params.push(new Date(startDate)); }
    if (endDate)   { where.push('visit_date <= ?'); params.push(new Date(endDate)); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const offset = (parsedPage - 1) * parsedLimit;

    const [rows] = await query(
      `SELECT * FROM prescription ${whereSql} ORDER BY visit_date DESC LIMIT ? OFFSET ?`,
      [...params, parsedLimit, offset]
    );
    const [[{ total }]] = await query(
      `SELECT COUNT(*) AS total FROM prescription ${whereSql}`,
      params
    );
    const prescriptions = await Promise.all(rows.map((r) => mapPrescriptionRow(r)));
    return res.json({
      success: true,
      data: prescriptions,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / parsedLimit),
      },
    });
  } catch (error) {
    next(error);
  }
};
