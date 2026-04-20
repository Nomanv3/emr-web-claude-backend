import { query, withTransaction } from '../config/mysql.js';
import { mapAppointmentRow } from '../db/mappers/appointment.mapper.js';
import { mapQueueRow } from '../db/mappers/queue.mapper.js';
import { insertQueueEntryMysql } from './queue.controller.js';
import { v4 as uuidv4 } from 'uuid';

// ─── helpers ────────────────────────────────────────────────────────────
const toBool = (v) => v === 1 || v === true;

async function loadAppointmentMysql(appointmentId) {
  const [[row]] = await query(
    'SELECT * FROM appointment WHERE appointment_id = ? AND deleted_at IS NULL LIMIT 1',
    [appointmentId]
  );
  if (!row) return null;
  const [svcRows] = await query(
    'SELECT * FROM appointment_services WHERE appointment_id = ?',
    [appointmentId]
  );
  const [svcIdRows] = await query(
    'SELECT service_id FROM appointment_service_ids WHERE appointment_id = ?',
    [appointmentId]
  );
  return mapAppointmentRow(row, svcRows, svcIdRows);
}

async function autoCreateInvoiceMysqlInTx(conn, organizationId, branchId, patientId, services, appointmentId) {
  if (!services || services.length === 0) return null;
  try {
    const invoiceId = uuidv4();
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
      [invoiceId, organizationId, patientId, appointmentId || null, subtotal, subtotal, subtotal]
    );
    for (let i = 0; i < lineItems.length; i++) {
      const li = lineItems[i];
      await conn.query(
        'INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, discount, total, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [invoiceId, li.description, li.quantity, li.unitPrice, li.discount, li.total, i]
      );
    }
    return invoiceId;
  } catch (err) {
    console.error('Auto-invoice creation failed:', err.message);
    return null;
  }
}

// Legacy Mongo helper (unchanged)
async function autoCreateInvoice(organizationId, branchId, patientId, services) {
  if (!services || services.length === 0) return null;
  try {
    const lineItems = services.map(s => ({
      description: s.name || 'Service',
      quantity: 1,
      unitPrice: Number(s.price) || 0,
      discount: 0,
      total: Number(s.price) || 0,
    }));
    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    const invoice = new Invoice({
      organizationId,
      branchId,
      patientId,
      lineItems,
      subtotal,
      totalAmount: subtotal,
      balanceDue: subtotal,
      status: 'Unpaid',
    });
    await invoice.save();
    return invoice;
  } catch (err) {
    console.error('Auto-invoice creation failed:', err.message);
    return null;
  }
}

export const getSlots = async (req, res, next) => {
  try {
    const { date, doctorId, branchId, startTime = '09:00', endTime = '18:00', duration, intervalMinutes } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DATE', message: 'date query parameter is required (YYYY-MM-DD)' },
      });
    }

    const slots = [];
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const interval = parseInt(duration) || parseInt(intervalMinutes) || 30;
    let current = startH * 60 + startM;
    const end = endH * 60 + endM;

    while (current < end) {
      const h = Math.floor(current / 60);
      const m = current % 60;
      const slotStart = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const nextMin = current + interval;
      const nh = Math.floor(nextMin / 60);
      const nm = nextMin % 60;
      const slotEnd = `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
      slots.push({ startTime: slotStart, endTime: slotEnd, time: slotStart });
      current += interval;
    }

    let bookedMap = new Map();
    const where = [`slot_date = ?`, `status <> 'Cancelled'`, 'deleted_at IS NULL'];
    const params = [date];
    if (doctorId) { where.push('doctor_id = ?'); params.push(doctorId); }
    if (branchId) { where.push('branch_id = ?'); params.push(branchId); }
    const [rows] = await query(
      `SELECT slot, appointment_id FROM appointment WHERE ${where.join(' AND ')}`,
      params
    );
    bookedMap = new Map(rows.map((r) => [r.slot, r.appointment_id]));

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const isToday = date === todayStr;
    const nowMinutes = isToday ? today.getHours() * 60 + today.getMinutes() : -1;

    const result = slots.map(s => {
      const isPast = isToday && (parseInt(s.time.split(':')[0]) * 60 + parseInt(s.time.split(':')[1])) <= nowMinutes;
      return {
        time: s.time,
        startTime: s.startTime,
        endTime: s.endTime,
        isAvailable: !bookedMap.has(s.time) && !isPast,
        available: !bookedMap.has(s.time) && !isPast,
        isPast,
        appointmentId: bookedMap.get(s.time) || null,
      };
    });

    res.json({
      success: true,
      data: { slots: result, date, totalSlots: result.length, availableCount: result.filter(s => s.isAvailable).length },
    });
  } catch (error) {
    next(error);
  }
};

export const getAppointments = async (req, res, next) => {
  try {
    const { organizationId, branchId, startDateUTC, endDateUTC, doctorId, status, date, page = 1, limit = 50 } = req.query;
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);

    const where = ['deleted_at IS NULL'];
    const params = [];
    if (organizationId) { where.push('organization_id = ?'); params.push(organizationId); }
    if (branchId)       { where.push('branch_id = ?');       params.push(branchId); }
    if (doctorId)       { where.push('doctor_id = ?');       params.push(doctorId); }
    if (status)         { where.push('status = ?');          params.push(status); }
    if (date)           { where.push('slot_date = ?');       params.push(date); }
    if (startDateUTC)   { where.push('slot_start_utc >= ?'); params.push(new Date(startDateUTC)); }
    if (endDateUTC)     { where.push('slot_start_utc <= ?'); params.push(new Date(endDateUTC)); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const offset = (parsedPage - 1) * parsedLimit;

    const [rows] = await query(
      `SELECT * FROM appointment ${whereSql} ORDER BY slot_date ASC, slot ASC LIMIT ? OFFSET ?`,
      [...params, parsedLimit, offset]
    );
    const [[{ total }]] = await query(
      `SELECT COUNT(*) AS total FROM appointment ${whereSql}`,
      params
    );
    let appointments = [];
    if (rows.length) {
      const ids = rows.map((r) => r.appointment_id);
      const ph = ids.map(() => '?').join(',');
      const [svcRows] = await query(
        `SELECT * FROM appointment_services WHERE appointment_id IN (${ph})`,
        ids
      );
      const [svcIdRows] = await query(
        `SELECT appointment_id, service_id FROM appointment_service_ids WHERE appointment_id IN (${ph})`,
        ids
      );
      const svcMap = {};
      const svcIdMap = {};
      for (const s of svcRows) (svcMap[s.appointment_id] ||= []).push(s);
      for (const s of svcIdRows) (svcIdMap[s.appointment_id] ||= []).push(s);
      appointments = rows.map((r) =>
        mapAppointmentRow(r, svcMap[r.appointment_id] || [], svcIdMap[r.appointment_id] || [])
      );
    }

    return res.json({
      success: true,
      data: appointments,
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

export const createAppointment = async (req, res, next) => {
  try {
    const organizationId = req.body.organizationId || req.user?.organizationId;
    const branchId = req.body.branchId || req.user?.branchId;
    const doctorId = req.body.doctorId || req.user?.userId;
    const { slotDate, slot } = req.body;

    req.body.organizationId = organizationId;
    req.body.branchId = branchId;
    req.body.doctorId = doctorId;

    const [[conflict]] = await query(
      `SELECT appointment_id FROM appointment
         WHERE organization_id = ? AND branch_id = ? AND doctor_id = ?
           AND slot_date = ? AND slot = ? AND status <> 'Cancelled' AND deleted_at IS NULL
         LIMIT 1`,
      [organizationId, branchId, doctorId, slotDate, slot]
    );
    if (conflict) {
      return res.status(409).json({
        success: false,
        error: { code: 'SLOT_CONFLICT', message: 'This slot is already booked' },
      });
    }

    let patientName = req.body.patientName || null;
    let uhid = '';
    if (req.body.patientId) {
      const [[p]] = await query(
        'SELECT name, uhid FROM patient WHERE patient_id = ? LIMIT 1',
        [req.body.patientId]
      );
      if (p) { patientName = patientName || p.name; uhid = p.uhid || ''; }
    }

    const services = req.body.services || [];
    const serviceIds = Array.isArray(req.body.serviceIds) ? req.body.serviceIds : [];
    const serviceAmount = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);

    const appointmentId = uuidv4();
    let newQueueId = null;
    let newInvoiceId = null;

    await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO appointment
           (appointment_id, organization_id, branch_id, patient_id, patient_name, phone,
            doctor_id, slot, slot_date, slot_start_utc, slot_end_utc, appointment_time,
            start_time, end_time, duration_minutes, tags, follow_up_date, status,
            payment_status, notes, is_follow_up, parent_appointment_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          appointmentId, organizationId, branchId,
          req.body.patientId, patientName, req.body.phone || null,
          doctorId, slot || null, slotDate || null,
          req.body.slotStartUTC ? new Date(req.body.slotStartUTC) : null,
          req.body.slotEndUTC ? new Date(req.body.slotEndUTC) : null,
          req.body.appointmentTime || null,
          req.body.startTime || null, req.body.endTime || null,
          Number(req.body.durationMinutes) || 15,
          req.body.tags || null, req.body.followUpDate || null,
          req.body.status || 'Booked',
          req.body.paymentStatus || 'Pending',
          req.body.notes || null,
          req.body.isFollowUp ? 1 : 0,
          req.body.parentAppointmentId || null,
          req.user?.userId || null,
        ]
      );
      for (const s of services) {
        await conn.query(
          'INSERT INTO appointment_services (appointment_id, service_id, name, price) VALUES (?, ?, ?, ?)',
          [appointmentId, s.serviceId || null, s.name || null, Number(s.price) || 0]
        );
      }
      for (const sid of serviceIds) {
        await conn.query(
          'INSERT INTO appointment_service_ids (appointment_id, service_id) VALUES (?, ?)',
          [appointmentId, sid]
        );
      }

      newInvoiceId = await autoCreateInvoiceMysqlInTx(
        conn, organizationId, branchId, req.body.patientId, services, appointmentId
      );

      newQueueId = await insertQueueEntryMysql(conn, {
        organizationId, branchId,
        appointmentId, patientId: req.body.patientId,
        patientName, uhid,
        slot, queueDate: slotDate,
        status: 'Waiting', paymentStatus: 'Pending',
        paymentAmount: serviceAmount, serviceAmount,
        appointmentType: 'scheduled',
        checkInTime: req.body.startTime || slot,
        tags: req.body.tags || '',
        durationMinutes: req.body.durationMinutes || 15,
        invoiceId: newInvoiceId || null,
        notes: req.body.notes || '',
        createdBy: req.user?.userId,
        services,
      });
    });

    const [[qRow]] = await query('SELECT * FROM queue WHERE queue_id = ? LIMIT 1', [newQueueId]);
    const [qSvcRows] = await query('SELECT * FROM queue_services WHERE queue_id = ?', [newQueueId]);

    const appointment = await loadAppointmentMysql(appointmentId);
    const queueEntry = mapQueueRow(qRow, qSvcRows);

    return res.status(201).json({
      success: true,
      data: { appointment, queueEntry },
      message: 'Appointment created and added to queue successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const checkinAppointment = async (req, res, next) => {
  try {
    const { appointmentId } = req.params;

    const [[apptRow]] = await query(
      'SELECT * FROM appointment WHERE appointment_id = ? AND deleted_at IS NULL LIMIT 1',
      [appointmentId]
    );
    if (!apptRow) {
      return res.status(404).json({
        success: false,
        error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' },
      });
    }

    const [[existingQ]] = await query(
      'SELECT * FROM queue WHERE appointment_id = ? AND deleted_at IS NULL LIMIT 1',
      [appointmentId]
    );

    let queueId;
    await withTransaction(async (conn) => {
      if (existingQ) {
        queueId = existingQ.queue_id;
        if (existingQ.status === 'Cancelled') {
          await conn.query(
            `UPDATE queue SET status = 'Waiting', arrival_time = CURRENT_TIMESTAMP WHERE queue_id = ?`,
            [existingQ.queue_id]
          );
        }
      } else {
        let patientName = apptRow.patient_name || null;
        let uhid = '';
        const [[p]] = await conn.query(
          'SELECT name, uhid FROM patient WHERE patient_id = ? LIMIT 1',
          [apptRow.patient_id]
        );
        if (p) { patientName = patientName || p.name; uhid = p.uhid || ''; }

        const [svcRows] = await conn.query(
          'SELECT service_id, name, price FROM appointment_services WHERE appointment_id = ?',
          [appointmentId]
        );
        const services = svcRows.map((s) => ({
          serviceId: s.service_id, name: s.name, price: Number(s.price) || 0,
        }));
        const serviceAmount = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);

        const invoiceId = await autoCreateInvoiceMysqlInTx(
          conn, apptRow.organization_id, apptRow.branch_id, apptRow.patient_id, services, appointmentId
        );

        queueId = await insertQueueEntryMysql(conn, {
          organizationId: apptRow.organization_id,
          branchId: apptRow.branch_id,
          appointmentId,
          patientId: apptRow.patient_id,
          patientName, uhid,
          slot: apptRow.slot,
          queueDate: apptRow.slot_date,
          status: 'Waiting',
          paymentStatus: 'Pending',
          paymentAmount: 0,
          serviceAmount,
          appointmentType: 'scheduled',
          invoiceId: invoiceId || null,
          createdBy: req.user?.userId,
          services,
        });
      }
      await conn.query(
        `UPDATE appointment SET status = 'Ongoing' WHERE appointment_id = ?`,
        [appointmentId]
      );
    });

    const appointment = await loadAppointmentMysql(appointmentId);
    const [[qRow]] = await query('SELECT * FROM queue WHERE queue_id = ? LIMIT 1', [queueId]);
    const [qSvcRows] = await query('SELECT * FROM queue_services WHERE queue_id = ?', [queueId]);
    const queueEntry = mapQueueRow(qRow, qSvcRows);

    return res.json({
      success: true,
      data: { appointment, queueEntry },
      message: 'Patient checked in successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const createFollowUp = async (req, res, next) => {
  try {
    const {
      parentAppointmentId, patientId, organizationId, branchId,
      doctorId, followUpDate, notes, services, slot, slotDate,
    } = req.body;

    const orgId = organizationId || req.user?.organizationId;
    const brId = branchId || req.user?.branchId;
    const docId = doctorId || req.user?.userId;

    if (parentAppointmentId) {
      const [[parent]] = await query(
        'SELECT appointment_id FROM appointment WHERE appointment_id = ? AND deleted_at IS NULL LIMIT 1',
        [parentAppointmentId]
      );
      if (!parent) {
        return res.status(404).json({
          success: false,
          error: { code: 'PARENT_NOT_FOUND', message: 'Parent appointment not found' },
        });
      }
    }

    const svc = Array.isArray(services) ? services : [];
    const apptId = uuidv4();

    await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO appointment
           (appointment_id, organization_id, branch_id, patient_id, doctor_id,
            slot, slot_date, follow_up_date, status, notes,
            is_follow_up, parent_appointment_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Follow Up', ?, 1, ?, ?)`,
        [
          apptId, orgId, brId, patientId, docId,
          slot || null,
          slotDate || followUpDate || null,
          followUpDate || slotDate || null,
          notes || null,
          parentAppointmentId || null,
          req.user?.userId || null,
        ]
      );
      for (const s of svc) {
        await conn.query(
          'INSERT INTO appointment_services (appointment_id, service_id, name, price) VALUES (?, ?, ?, ?)',
          [apptId, s.serviceId || null, s.name || null, Number(s.price) || 0]
        );
      }
    });

    const [[pRow]] = await query(
      'SELECT name FROM patient WHERE patient_id = ? LIMIT 1',
      [patientId]
    );
    const appointment = await loadAppointmentMysql(apptId);
    return res.status(201).json({
      success: true,
      data: { ...appointment, patientName: pRow?.name || '' },
      message: 'Follow-up appointment created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const updateAppointment = async (req, res, next) => {
  try {
    const [[existing]] = await query(
      'SELECT appointment_id FROM appointment WHERE appointment_id = ? AND deleted_at IS NULL LIMIT 1',
      [req.params.appointmentId]
    );
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' },
      });
    }

    const b = req.body;
    const sets = [];
    const params = [];
    const colMap = {
      organizationId: 'organization_id', branchId: 'branch_id',
      patientId: 'patient_id', patientName: 'patient_name', phone: 'phone',
      doctorId: 'doctor_id', slot: 'slot', slotDate: 'slot_date',
      appointmentTime: 'appointment_time', startTime: 'start_time', endTime: 'end_time',
      durationMinutes: 'duration_minutes', tags: 'tags', followUpDate: 'follow_up_date',
      status: 'status', paymentStatus: 'payment_status', notes: 'notes',
      parentAppointmentId: 'parent_appointment_id',
    };
    for (const [k, col] of Object.entries(colMap)) {
      if (b[k] !== undefined) { sets.push(`${col} = ?`); params.push(b[k]); }
    }
    if (b.slotStartUTC !== undefined) { sets.push('slot_start_utc = ?'); params.push(b.slotStartUTC ? new Date(b.slotStartUTC) : null); }
    if (b.slotEndUTC !== undefined)   { sets.push('slot_end_utc = ?');   params.push(b.slotEndUTC ? new Date(b.slotEndUTC) : null); }
    if (b.isFollowUp !== undefined)   { sets.push('is_follow_up = ?');   params.push(b.isFollowUp ? 1 : 0); }

    await withTransaction(async (conn) => {
      if (sets.length) {
        await conn.query(
          `UPDATE appointment SET ${sets.join(', ')} WHERE appointment_id = ?`,
          [...params, req.params.appointmentId]
        );
      }
      if (Array.isArray(b.services)) {
        await conn.query('DELETE FROM appointment_services WHERE appointment_id = ?', [req.params.appointmentId]);
        for (const s of b.services) {
          await conn.query(
            'INSERT INTO appointment_services (appointment_id, service_id, name, price) VALUES (?, ?, ?, ?)',
            [req.params.appointmentId, s.serviceId || null, s.name || null, Number(s.price) || 0]
          );
        }
      }
      if (Array.isArray(b.serviceIds)) {
        await conn.query('DELETE FROM appointment_service_ids WHERE appointment_id = ?', [req.params.appointmentId]);
        for (const sid of b.serviceIds) {
          await conn.query(
            'INSERT INTO appointment_service_ids (appointment_id, service_id) VALUES (?, ?)',
            [req.params.appointmentId, sid]
          );
        }
      }
    });

    const appointment = await loadAppointmentMysql(req.params.appointmentId);
    return res.json({ success: true, data: appointment, message: 'Appointment updated successfully' });
  } catch (error) {
    next(error);
  }
};

export const deleteAppointment = async (req, res, next) => {
  try {
    const [result] = await query(
      `UPDATE appointment SET status = 'Cancelled'
         WHERE appointment_id = ? AND deleted_at IS NULL`,
      [req.params.appointmentId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' },
      });
    }
    return res.json({ success: true, message: 'Appointment cancelled' });
  } catch (error) {
    next(error);
  }
};
