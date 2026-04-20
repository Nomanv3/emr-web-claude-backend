import { query } from '../config/mysql.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function resolveRange(startDate, endDate) {
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86400000);
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function scopedWhere(cols, { organizationId, branchId }) {
  const where = [];
  const params = [];
  if (organizationId && cols.org) { where.push(`${cols.org} = ?`); params.push(organizationId); }
  if (branchId && cols.branch)    { where.push(`${cols.branch} = ?`); params.push(branchId); }
  return { where, params };
}

async function countAppt(where, params) {
  const [rows] = await query(
    `SELECT COUNT(*) AS c FROM appointment WHERE ${where.length ? where.join(' AND ') : '1=1'}`,
    params,
  );
  return rows[0]?.c || 0;
}

// ─── 1. Analytics Summary ────────────────────────────────────────────────────
export const getAnalyticsSummary = async (req, res, next) => {
  try {
    const { organizationId, branchId, startDate, endDate } = req.query;
    const { start, end } = resolveRange(startDate, endDate);

    const apptBase = scopedWhere(
      { org: 'organization_id', branch: 'branch_id' },
      { organizationId, branchId },
    );
    const apptWhere = [...apptBase.where, 'created_at >= ?', 'created_at <= ?', 'deleted_at IS NULL'];
    const apptParams = [...apptBase.params, start, end];

    const [totalAppointments, scheduledAppointments, completedAppointments, cancelledAppointments, noShowAppointments] = await Promise.all([
      countAppt(apptWhere, apptParams),
      countAppt([...apptWhere, 'status = ?'], [...apptParams, 'Booked']),
      countAppt([...apptWhere, 'status = ?'], [...apptParams, 'Completed']),
      countAppt([...apptWhere, 'status = ?'], [...apptParams, 'Cancelled']),
      // No 'No Show' enum value in SQL schema — always 0 (parity with Mongo).
      Promise.resolve(0),
    ]);

    // Patients
    const patBase = scopedWhere({ org: 'organization_id', branch: 'branch_id' }, { organizationId, branchId });
    const patWhere = [...patBase.where, 'is_active = 1'];
    const [[totalRow]] = await query(
      `SELECT COUNT(*) AS c FROM patient WHERE ${patWhere.join(' AND ')}`,
      patBase.params,
    );
    const [[newRow]] = await query(
      `SELECT COUNT(*) AS c FROM patient WHERE ${patWhere.join(' AND ')} AND created_at >= ? AND created_at <= ?`,
      [...patBase.params, start, end],
    );
    const totalPatients = totalRow?.c || 0;
    const newPatientsThisPeriod = newRow?.c || 0;

    // Returning: patients who had appointments in period AND registered before start.
    const retWhere = ['a.created_at >= ?', 'a.created_at <= ?', 'a.deleted_at IS NULL'];
    const retParams = [start, end];
    if (organizationId) { retWhere.push('a.organization_id = ?'); retParams.push(organizationId); }
    if (branchId)       { retWhere.push('a.branch_id = ?');       retParams.push(branchId); }
    const [[retRow]] = await query(
      `SELECT COUNT(DISTINCT a.patient_id) AS c
       FROM appointment a
       JOIN patient p ON p.patient_id = a.patient_id
       WHERE ${retWhere.join(' AND ')} AND p.created_at < ?`,
      [...retParams, start],
    );
    const returningThisPeriod = retRow?.c || 0;

    // Revenue by method
    const payWhere = ['collected_at >= ?', 'collected_at <= ?'];
    const payParams = [start, end];
    if (organizationId) {
      payWhere.push('invoice_id IN (SELECT invoice_id FROM invoice WHERE organization_id = ?)');
      payParams.push(organizationId);
    }
    const [revenueRows] = await query(
      `SELECT method, SUM(amount) AS total, COUNT(*) AS count
       FROM payment WHERE ${payWhere.join(' AND ')} GROUP BY method`,
      payParams,
    );
    const revenueByMethod = { Cash: 0, Card: 0, Online: 0, UPI: 0 };
    let totalRevenue = 0;
    for (const r of revenueRows) {
      const amt = Number(r.total) || 0;
      if (r.method in revenueByMethod) revenueByMethod[r.method] = amt;
      totalRevenue += amt;
    }

    // Pending invoices
    const invBase = scopedWhere({ org: 'organization_id' }, { organizationId });
    const invWhere = [...invBase.where, "status IN ('Unpaid','Partial')", 'created_at >= ?', 'created_at <= ?', 'deleted_at IS NULL'];
    const [[pendRow]] = await query(
      `SELECT COALESCE(SUM(balance_due), 0) AS pending FROM invoice WHERE ${invWhere.join(' AND ')}`,
      [...invBase.params, start, end],
    );
    const pendingRevenue = Number(pendRow?.pending) || 0;

    // Services (top)
    const svcWhere = ['i.created_at >= ?', 'i.created_at <= ?', 'i.deleted_at IS NULL'];
    const svcParams = [start, end];
    if (organizationId) { svcWhere.push('i.organization_id = ?'); svcParams.push(organizationId); }
    const [serviceRows] = await query(
      `SELECT li.description AS name, SUM(li.quantity) AS count, SUM(li.total) AS revenue
       FROM invoice_line_items li
       JOIN invoice i ON i.invoice_id = li.invoice_id
       WHERE ${svcWhere.join(' AND ')}
       GROUP BY li.description
       ORDER BY count DESC LIMIT 20`,
      svcParams,
    );
    const services = serviceRows.map((r) => ({
      name: r.name || 'Unknown',
      count: Number(r.count) || 0,
      revenue: Number(r.revenue) || 0,
    }));

    // Daily trends
    const [dailyApptRows] = await query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COUNT(*) AS c
       FROM appointment WHERE ${apptWhere.join(' AND ')}
       GROUP BY d ORDER BY d`,
      apptParams,
    );
    const [dailyRevRows] = await query(
      `SELECT DATE_FORMAT(collected_at, '%Y-%m-%d') AS d, SUM(amount) AS r
       FROM payment WHERE ${payWhere.join(' AND ')} GROUP BY d ORDER BY d`,
      payParams,
    );
    const [dailyPatRows] = await query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COUNT(*) AS c
       FROM patient WHERE ${patWhere.join(' AND ')} AND created_at >= ? AND created_at <= ?
       GROUP BY d ORDER BY d`,
      [...patBase.params, start, end],
    );
    const dailyMap = {};
    const ensureDay = (d) => (dailyMap[d] ||= { date: d, appointments: 0, revenue: 0, newPatients: 0 });
    for (const r of dailyApptRows) ensureDay(r.d).appointments = Number(r.c) || 0;
    for (const r of dailyRevRows)  ensureDay(r.d).revenue      = Number(r.r) || 0;
    for (const r of dailyPatRows)  ensureDay(r.d).newPatients  = Number(r.c) || 0;
    const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    return res.json({
      success: true,
      data: {
        appointments: {
          total: totalAppointments,
          scheduled: scheduledAppointments,
          completed: completedAppointments,
          cancelled: cancelledAppointments,
          noShow: noShowAppointments,
        },
        patients: { total: totalPatients, newThisPeriod: newPatientsThisPeriod, returningThisPeriod },
        revenue: {
          total: totalRevenue,
          collected: totalRevenue,
          pending: pendingRevenue,
          byMethod: {
            cash: revenueByMethod.Cash,
            card: revenueByMethod.Card,
            online: revenueByMethod.Online,
            upi: revenueByMethod.UPI,
          },
        },
        services,
        dailyTrend,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── 2. Appointment Analytics ────────────────────────────────────────────────
export const getAppointmentAnalytics = async (req, res, next) => {
  try {
    const { organizationId, branchId, startDate, endDate } = req.query;

    const where = ['deleted_at IS NULL'];
    const params = [];
    if (organizationId) { where.push('organization_id = ?'); params.push(organizationId); }
    if (branchId)       { where.push('branch_id = ?'); params.push(branchId); }
    if (startDate)      { where.push('created_at >= ?'); params.push(new Date(startDate)); }
    if (endDate)        { where.push('created_at <= ?'); params.push(new Date(endDate)); }

    const [totalR, bookedR, completedR, cancelledR] = await Promise.all([
      query(`SELECT COUNT(*) AS c FROM appointment WHERE ${where.join(' AND ')}`, params),
      query(`SELECT COUNT(*) AS c FROM appointment WHERE ${where.join(' AND ')} AND status = ?`, [...params, 'Booked']),
      query(`SELECT COUNT(*) AS c FROM appointment WHERE ${where.join(' AND ')} AND status = ?`, [...params, 'Completed']),
      query(`SELECT COUNT(*) AS c FROM appointment WHERE ${where.join(' AND ')} AND status = ?`, [...params, 'Cancelled']),
    ]);
    return res.json({
      success: true,
      data: {
        total:     totalR[0][0]?.c || 0,
        booked:    bookedR[0][0]?.c || 0,
        completed: completedR[0][0]?.c || 0,
        cancelled: cancelledR[0][0]?.c || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── 3. Patient Analytics ────────────────────────────────────────────────────
export const getPatientAnalytics = async (req, res, next) => {
  try {
    const { organizationId, branchId, startDate, endDate } = req.query;

    const where = ['is_active = 1'];
    const params = [];
    if (organizationId) { where.push('organization_id = ?'); params.push(organizationId); }
    if (branchId)       { where.push('branch_id = ?'); params.push(branchId); }
    if (startDate)      { where.push('created_at >= ?'); params.push(new Date(startDate)); }
    if (endDate)        { where.push('created_at <= ?'); params.push(new Date(endDate)); }

    const [[row]] = await query(`SELECT COUNT(*) AS c FROM patient WHERE ${where.join(' AND ')}`, params);
    return res.json({ success: true, data: { newPatients: row?.c || 0 } });
  } catch (error) {
    next(error);
  }
};

// ─── 4. Revenue Analytics ────────────────────────────────────────────────────
export const getRevenueAnalytics = async (req, res, next) => {
  try {
    const { organizationId, startDate, endDate } = req.query;

    const where = [];
    const params = [];
    if (organizationId) {
      where.push('invoice_id IN (SELECT invoice_id FROM invoice WHERE organization_id = ?)');
      params.push(organizationId);
    }
    if (startDate) { where.push('collected_at >= ?'); params.push(new Date(startDate)); }
    if (endDate)   { where.push('collected_at <= ?'); params.push(new Date(endDate)); }
    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await query(
      `SELECT method, SUM(amount) AS total, COUNT(*) AS count
       FROM payment ${whereSQL} GROUP BY method`,
      params,
    );
    const byMethod = rows.map((r) => ({
      method: r.method,
      total: Number(r.total) || 0,
      count: Number(r.count) || 0,
    }));
    const totalRevenue = byMethod.reduce((s, m) => s + m.total, 0);
    const totalTransactions = byMethod.reduce((s, m) => s + m.count, 0);
    return res.json({ success: true, data: { totalRevenue, totalTransactions, byMethod } });
  } catch (error) {
    next(error);
  }
};

// ─── 5. Service Analytics ────────────────────────────────────────────────────
export const getServiceAnalytics = async (req, res, next) => {
  try {
    const { organizationId, startDate, endDate } = req.query;

    const where = ['i.deleted_at IS NULL'];
    const params = [];
    if (organizationId) { where.push('i.organization_id = ?'); params.push(organizationId); }
    if (startDate)      { where.push('i.created_at >= ?'); params.push(new Date(startDate)); }
    if (endDate)        { where.push('i.created_at <= ?'); params.push(new Date(endDate)); }

    const [rows] = await query(
      `SELECT li.description AS name, SUM(li.quantity) AS count, SUM(li.total) AS revenue
       FROM invoice_line_items li
       JOIN invoice i ON i.invoice_id = li.invoice_id
       WHERE ${where.join(' AND ')}
       GROUP BY li.description
       ORDER BY count DESC LIMIT 20`,
      params,
    );
    const services = rows.map((r) => ({
      name: r.name || 'Unknown',
      count: Number(r.count) || 0,
      revenue: Number(r.revenue) || 0,
    }));
    return res.json({ success: true, data: { services } });
  } catch (error) {
    next(error);
  }
};
