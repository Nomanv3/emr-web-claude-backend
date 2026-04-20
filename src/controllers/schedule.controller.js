import { query } from '../config/mysql.js';
import { mapQueueRow } from '../db/mappers/queue.mapper.js';
import { mapAppointmentRow } from '../db/mappers/appointment.mapper.js';

export const getSchedule = async (req, res, next) => {
  try {
    const { organizationId, branchId, date } = req.query;

    if (!organizationId || !branchId || !date) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'organizationId, branchId, and date are required' },
      });
    }

    // ── Queue rows for the date ─────────────────────────────────────────
    const [queueRows] = await query(
      `SELECT * FROM queue
       WHERE organization_id = ? AND branch_id = ? AND queue_date = ?
         AND deleted_at IS NULL
       ORDER BY token_number ASC`,
      [organizationId, branchId, date]
    );

    const queueIds = queueRows.map((r) => r.queue_id);
    let queueServiceMap = {};
    if (queueIds.length > 0) {
      const placeholders = queueIds.map(() => '?').join(', ');
      const [svcRows] = await query(
        `SELECT * FROM queue_services WHERE queue_id IN (${placeholders})`,
        queueIds
      );
      for (const s of svcRows) {
        if (!queueServiceMap[s.queue_id]) queueServiceMap[s.queue_id] = [];
        queueServiceMap[s.queue_id].push(s);
      }
    }

    const queueMapped = queueRows.map((r) =>
      mapQueueRow(r, queueServiceMap[r.queue_id] || [])
    );

    // ── Appointments (non-follow-up) for the date ──────────────────────
    const [apptRows] = await query(
      `SELECT * FROM appointment
       WHERE organization_id = ? AND branch_id = ? AND slot_date = ?
         AND status != 'Follow Up' AND deleted_at IS NULL
       ORDER BY slot ASC`,
      [organizationId, branchId, date]
    );

    // ── Follow-up appointments ─────────────────────────────────────────
    const [followupRows] = await query(
      `SELECT * FROM appointment
       WHERE organization_id = ? AND branch_id = ?
         AND deleted_at IS NULL
         AND (follow_up_date = ? OR (slot_date = ? AND status = 'Follow Up'))
       ORDER BY slot ASC`,
      [organizationId, branchId, date, date]
    );

    const allApptIds = [
      ...apptRows.map((r) => r.appointment_id),
      ...followupRows.map((r) => r.appointment_id),
    ];
    let apptServiceMap = {};
    let apptServiceIdMap = {};
    if (allApptIds.length > 0) {
      const ph = allApptIds.map(() => '?').join(', ');
      const [asvcs] = await query(
        `SELECT * FROM appointment_services WHERE appointment_id IN (${ph})`,
        allApptIds
      );
      const [asids] = await query(
        `SELECT * FROM appointment_service_ids WHERE appointment_id IN (${ph})`,
        allApptIds
      );
      for (const s of asvcs) {
        if (!apptServiceMap[s.appointment_id]) apptServiceMap[s.appointment_id] = [];
        apptServiceMap[s.appointment_id].push(s);
      }
      for (const s of asids) {
        if (!apptServiceIdMap[s.appointment_id]) apptServiceIdMap[s.appointment_id] = [];
        apptServiceIdMap[s.appointment_id].push(s);
      }
    }

    const mapAppt = (r) =>
      mapAppointmentRow(
        r,
        apptServiceMap[r.appointment_id] || [],
        apptServiceIdMap[r.appointment_id] || []
      );

    return res.json({
      success: true,
      data: {
        queue:        queueMapped,
        appointments: apptRows.map(mapAppt),
        followups:    followupRows.map(mapAppt),
      },
    });
  } catch (error) {
    next(error);
  }
};
