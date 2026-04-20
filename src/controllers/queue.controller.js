import { query, withTransaction } from '../config/mysql.js';
import { mapQueueRow } from '../db/mappers/queue.mapper.js';
import { v4 as uuidv4 } from 'uuid';

async function loadQueueWithServices(queueIds) {
  if (queueIds.length === 0) return [];
  const ph = queueIds.map(() => '?').join(',');
  const [rows] = await query(
    `SELECT * FROM queue WHERE queue_id IN (${ph}) AND deleted_at IS NULL`,
    queueIds
  );
  const [svcRows] = await query(
    `SELECT * FROM queue_services WHERE queue_id IN (${ph})`,
    queueIds
  );
  const svcMap = {};
  for (const s of svcRows) (svcMap[s.queue_id] ||= []).push(s);
  return rows.map((r) => mapQueueRow(r, svcMap[r.queue_id] || []));
}

export const getQueue = async (req, res, next) => {
  try {
    const { organizationId, branchId, date, dateFrom, dateTo } = req.query;

    if (!organizationId || !branchId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'organizationId and branchId are required' },
      });
    }

    if (!date && !(dateFrom && dateTo)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Either date, or both dateFrom and dateTo are required' },
      });
    }

    const where = ['organization_id = ?', 'branch_id = ?', 'deleted_at IS NULL'];
    const params = [organizationId, branchId];
    if (date) {
      where.push('queue_date = ?');
      params.push(date);
    } else {
      where.push('queue_date >= ?', 'queue_date <= ?');
      params.push(dateFrom, dateTo);
    }
    const [rows] = await query(
      `SELECT * FROM queue WHERE ${where.join(' AND ')} ORDER BY queue_date ASC, token_number ASC`,
      params
    );
    let queue = [];
    if (rows.length) {
      const ids = rows.map((r) => r.queue_id);
      const ph = ids.map(() => '?').join(',');
      const [svcRows] = await query(
        `SELECT * FROM queue_services WHERE queue_id IN (${ph})`,
        ids
      );
      const svcMap = {};
      for (const s of svcRows) (svcMap[s.queue_id] ||= []).push(s);
      queue = rows.map((r) => mapQueueRow(r, svcMap[r.queue_id] || []));
    }
    return res.json({ success: true, data: { queue } });
  } catch (error) {
    next(error);
  }
};

export const addToQueue = async (req, res, next) => {
  try {
    const { organizationId, branchId, patientId, queueDate } = req.body;

    let patientName = req.body.patientName;
    let uhid = req.body.uhid;
    if (!patientName && patientId) {
      const [[p]] = await query(
        'SELECT name, uhid FROM patient WHERE patient_id = ? LIMIT 1',
        [patientId]
      );
      if (p) { patientName = p.name; uhid = p.uhid; }
    }

    const services = req.body.services || [];
    const serviceAmount = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
    const queueId = uuidv4();
    let newInvoiceId = null;

    await withTransaction(async (conn) => {
      const [[{ maxToken }]] = await conn.query(
        `SELECT MAX(token_number) AS maxToken FROM queue
           WHERE organization_id = ? AND branch_id = ? AND queue_date = ?`,
        [organizationId, branchId, queueDate]
      );
      const tokenNumber = (Number(maxToken) || 0) + 1;

      await conn.query(
        `INSERT INTO queue
           (queue_id, organization_id, branch_id, appointment_id, patient_id,
            patient_name, uhid, token_number, slot, queue_date, arrival_time,
            status, payment_status, payment_amount, service_amount, appointment_type,
            check_in_time, tags, duration_minutes, invoice_id, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          queueId, organizationId, branchId,
          req.body.appointmentId || null, patientId,
          patientName || null, uhid || null, tokenNumber,
          req.body.slot || null, queueDate,
          req.body.status || 'Waiting',
          req.body.paymentStatus || 'Pending',
          Number(req.body.paymentAmount) || serviceAmount,
          serviceAmount,
          req.body.appointmentType || 'walk_in',
          req.body.checkInTime || null,
          req.body.tags || null,
          Number(req.body.durationMinutes) || 15,
          null,
          req.body.notes || null,
          req.user?.userId || null,
        ]
      );
      for (const s of services) {
        await conn.query(
          'INSERT INTO queue_services (queue_id, service_id, name, price) VALUES (?, ?, ?, ?)',
          [queueId, s.serviceId || null, s.name || null, Number(s.price) || 0]
        );
      }

      if (services.length > 0) {
        newInvoiceId = uuidv4();
        const lineItems = services.map((s) => ({
          description: s.name || 'Service',
          quantity: 1,
          unitPrice: Number(s.price) || 0,
          discount: 0,
          total: Number(s.price) || 0,
        }));
        const subtotal = lineItems.reduce((sum, it) => sum + it.total, 0);
        await conn.query(
          `INSERT INTO invoice
             (invoice_id, organization_id, patient_id, appointment_id,
              subtotal, discount, tax, total_amount, paid_amount, balance_due, status)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?, 0, ?, 'Unpaid')`,
          [newInvoiceId, organizationId, patientId, req.body.appointmentId || null,
           subtotal, subtotal, subtotal]
        );
        for (let i = 0; i < lineItems.length; i++) {
          const li = lineItems[i];
          await conn.query(
            'INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, discount, total, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [newInvoiceId, li.description, li.quantity, li.unitPrice, li.discount, li.total, i]
          );
        }
        await conn.query(
          'UPDATE queue SET invoice_id = ? WHERE queue_id = ?',
          [newInvoiceId, queueId]
        );
      }
    });

    const [entry] = await loadQueueWithServices([queueId]);
    return res.status(201).json({
      success: true,
      data: entry,
      message: 'Patient added to queue',
    });
  } catch (error) {
    next(error);
  }
};

export const updateQueueEntry = async (req, res, next) => {
  try {
    const [[existing]] = await query(
      'SELECT queue_id FROM queue WHERE queue_id = ? AND deleted_at IS NULL LIMIT 1',
      [req.params.queueId]
    );
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'QUEUE_NOT_FOUND', message: 'Queue entry not found' },
      });
    }
    const b = req.body;
    const sets = [];
    const params = [];
    const colMap = {
      status: 'status', paymentStatus: 'payment_status', tokenNumber: 'token_number',
      slot: 'slot', queueDate: 'queue_date', appointmentType: 'appointment_type',
      checkInTime: 'check_in_time', tags: 'tags', notes: 'notes', invoiceId: 'invoice_id',
      durationMinutes: 'duration_minutes', patientName: 'patient_name', uhid: 'uhid',
      paymentAmount: 'payment_amount', serviceAmount: 'service_amount',
      appointmentId: 'appointment_id',
    };
    for (const [k, col] of Object.entries(colMap)) {
      if (b[k] !== undefined) { sets.push(`${col} = ?`); params.push(b[k]); }
    }

    await withTransaction(async (conn) => {
      if (sets.length) {
        await conn.query(
          `UPDATE queue SET ${sets.join(', ')} WHERE queue_id = ?`,
          [...params, req.params.queueId]
        );
      }
      if (Array.isArray(b.services)) {
        await conn.query('DELETE FROM queue_services WHERE queue_id = ?', [req.params.queueId]);
        for (const s of b.services) {
          await conn.query(
            'INSERT INTO queue_services (queue_id, service_id, name, price) VALUES (?, ?, ?, ?)',
            [req.params.queueId, s.serviceId || null, s.name || null, Number(s.price) || 0]
          );
        }
        const svcAmount = b.services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
        await conn.query(
          'UPDATE queue SET service_amount = ? WHERE queue_id = ?',
          [svcAmount, req.params.queueId]
        );
      }
    });

    const [entry] = await loadQueueWithServices([req.params.queueId]);
    return res.json({ success: true, data: entry, message: 'Queue entry updated' });
  } catch (error) {
    next(error);
  }
};

export const getQueueStats = async (req, res, next) => {
  try {
    const { organizationId, branchId, date } = req.query;

    if (!organizationId || !branchId || !date) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'organizationId, branchId, and date are required' },
      });
    }

    const [rows] = await query(
      `SELECT status, COUNT(*) AS cnt FROM queue
         WHERE organization_id = ? AND branch_id = ? AND queue_date = ? AND deleted_at IS NULL
         GROUP BY status`,
      [organizationId, branchId, date]
    );
    const result = { waiting: 0, ongoing: 0, completed: 0, cancelled: 0, total: 0 };
    for (const r of rows) {
      const key = String(r.status).toLowerCase();
      const cnt = Number(r.cnt);
      if (Object.prototype.hasOwnProperty.call(result, key)) result[key] = cnt;
      result.total += cnt;
    }
    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const removeFromQueue = async (req, res, next) => {
  try {
    const [result] = await query(
      `UPDATE queue SET status = 'Cancelled' WHERE queue_id = ? AND deleted_at IS NULL`,
      [req.params.queueId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'QUEUE_NOT_FOUND', message: 'Queue entry not found' },
      });
    }
    return res.json({ success: true, message: 'Removed from queue' });
  } catch (error) {
    next(error);
  }
};

// Exported helper for appointments.controller.js to reuse the MySQL queue-insert
// logic inside a single transaction (avoids nested withTransaction).
export async function insertQueueEntryMysql(conn, data) {
  const {
    organizationId, branchId, appointmentId, patientId, patientName, uhid,
    slot, queueDate, status = 'Waiting', paymentStatus = 'Pending',
    paymentAmount = 0, serviceAmount = 0, appointmentType = 'scheduled',
    checkInTime = null, tags = null, durationMinutes = 15, invoiceId = null,
    notes = null, createdBy = null, services = [],
  } = data;

  const [[{ maxToken }]] = await conn.query(
    `SELECT MAX(token_number) AS maxToken FROM queue
       WHERE organization_id = ? AND branch_id = ? AND queue_date = ?`,
    [organizationId, branchId, queueDate]
  );
  const tokenNumber = (Number(maxToken) || 0) + 1;

  const queueId = uuidv4();
  await conn.query(
    `INSERT INTO queue
       (queue_id, organization_id, branch_id, appointment_id, patient_id,
        patient_name, uhid, token_number, slot, queue_date, arrival_time,
        status, payment_status, payment_amount, service_amount, appointment_type,
        check_in_time, tags, duration_minutes, invoice_id, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      queueId, organizationId, branchId, appointmentId || null, patientId,
      patientName || null, uhid || null, tokenNumber, slot || null, queueDate,
      status, paymentStatus, Number(paymentAmount) || 0, Number(serviceAmount) || 0,
      appointmentType, checkInTime, tags, durationMinutes, invoiceId, notes, createdBy,
    ]
  );
  for (const s of services) {
    await conn.query(
      'INSERT INTO queue_services (queue_id, service_id, name, price) VALUES (?, ?, ?, ?)',
      [queueId, s.serviceId || null, s.name || null, Number(s.price) || 0]
    );
  }
  return queueId;
}
