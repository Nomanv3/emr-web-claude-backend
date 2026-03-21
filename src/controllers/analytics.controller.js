import Appointment from '../models/Appointment.js';
import Patient from '../models/Patient.js';
import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import Queue from '../models/Queue.js';

export const getAnalyticsSummary = async (req, res, next) => {
  try {
    const { organizationId, branchId, startDate, endDate } = req.query;

    const orgMatch = {};
    if (organizationId) orgMatch.organizationId = organizationId;
    if (branchId) orgMatch.branchId = branchId;

    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();
    // Ensure end date includes the full day
    end.setHours(23, 59, 59, 999);

    const dateRange = { $gte: start, $lte: end };

    // --- Appointments ---
    const appointmentMatch = { ...orgMatch, createdAt: dateRange };
    const [
      totalAppointments,
      scheduledAppointments,
      completedAppointments,
      cancelledAppointments,
      noShowAppointments,
    ] = await Promise.all([
      Appointment.countDocuments(appointmentMatch),
      Appointment.countDocuments({ ...appointmentMatch, status: 'Booked' }),
      Appointment.countDocuments({ ...appointmentMatch, status: 'Completed' }),
      Appointment.countDocuments({ ...appointmentMatch, status: 'Cancelled' }),
      Appointment.countDocuments({ ...appointmentMatch, status: 'No Show' }),
    ]);

    // --- Patients ---
    const patientOrgMatch = {};
    if (organizationId) patientOrgMatch.organizationId = organizationId;
    if (branchId) patientOrgMatch.branchId = branchId;

    const [totalPatients, newPatientsThisPeriod] = await Promise.all([
      Patient.countDocuments({ ...patientOrgMatch, isActive: true }),
      Patient.countDocuments({ ...patientOrgMatch, isActive: true, createdAt: dateRange }),
    ]);

    // Returning patients: patients who had a prescription before the period AND during the period
    const returningPatientsAgg = await Appointment.aggregate([
      { $match: { ...orgMatch, createdAt: dateRange } },
      { $group: { _id: '$patientId' } },
      {
        $lookup: {
          from: 'patients',
          let: { pid: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$patientId', '$$pid'] }, { $lt: ['$createdAt', start] }] } } },
            { $limit: 1 },
          ],
          as: 'existing',
        },
      },
      { $match: { 'existing.0': { $exists: true } } },
      { $count: 'count' },
    ]);
    const returningThisPeriod = returningPatientsAgg[0]?.count || 0;

    // --- Revenue ---
    const paymentDateMatch = { collectedAt: dateRange };
    if (organizationId) paymentDateMatch.organizationId = organizationId;

    const revenueAgg = await Payment.aggregate([
      { $match: paymentDateMatch },
      {
        $group: {
          _id: '$method',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const revenueByMethod = { Cash: 0, Card: 0, Online: 0, UPI: 0 };
    let totalRevenue = 0;
    for (const entry of revenueAgg) {
      if (entry._id && revenueByMethod.hasOwnProperty(entry._id)) {
        revenueByMethod[entry._id] = entry.total;
      }
      totalRevenue += entry.total;
    }

    // Pending revenue from unpaid/partial invoices
    const invoiceOrgMatch = {};
    if (organizationId) invoiceOrgMatch.organizationId = organizationId;

    const pendingAgg = await Invoice.aggregate([
      { $match: { ...invoiceOrgMatch, status: { $in: ['Unpaid', 'Partial'] }, createdAt: dateRange } },
      { $group: { _id: null, pending: { $sum: '$balanceDue' } } },
    ]);
    const pendingRevenue = pendingAgg[0]?.pending || 0;

    // --- Services (top services from invoices) ---
    const serviceAgg = await Invoice.aggregate([
      { $match: { ...invoiceOrgMatch, createdAt: dateRange } },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: '$lineItems.description',
          count: { $sum: '$lineItems.quantity' },
          revenue: { $sum: '$lineItems.total' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    const services = serviceAgg.map(s => ({
      name: s._id || 'Unknown',
      count: s.count,
      revenue: s.revenue,
    }));

    // --- Daily Trend ---
    const dailyAppointments = await Appointment.aggregate([
      { $match: { ...orgMatch, createdAt: dateRange } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          appointments: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dailyRevenue = await Payment.aggregate([
      { $match: paymentDateMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$collectedAt' } },
          revenue: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dailyNewPatients = await Patient.aggregate([
      { $match: { ...patientOrgMatch, isActive: true, createdAt: dateRange } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          newPatients: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Merge daily data
    const dailyMap = {};
    for (const d of dailyAppointments) {
      dailyMap[d._id] = { date: d._id, appointments: d.appointments, revenue: 0, newPatients: 0 };
    }
    for (const d of dailyRevenue) {
      if (!dailyMap[d._id]) dailyMap[d._id] = { date: d._id, appointments: 0, revenue: 0, newPatients: 0 };
      dailyMap[d._id].revenue = d.revenue;
    }
    for (const d of dailyNewPatients) {
      if (!dailyMap[d._id]) dailyMap[d._id] = { date: d._id, appointments: 0, revenue: 0, newPatients: 0 };
      dailyMap[d._id].newPatients = d.newPatients;
    }
    const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      data: {
        appointments: {
          total: totalAppointments,
          scheduled: scheduledAppointments,
          completed: completedAppointments,
          cancelled: cancelledAppointments,
          noShow: noShowAppointments,
        },
        patients: {
          total: totalPatients,
          newThisPeriod: newPatientsThisPeriod,
          returningThisPeriod,
        },
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

export const getAppointmentAnalytics = async (req, res, next) => {
  try {
    const { organizationId, branchId, startDate, endDate } = req.query;

    const filter = {};
    if (organizationId) filter.organizationId = organizationId;
    if (branchId) filter.branchId = branchId;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [total, booked, completed, cancelled] = await Promise.all([
      Appointment.countDocuments(filter),
      Appointment.countDocuments({ ...filter, status: 'Booked' }),
      Appointment.countDocuments({ ...filter, status: 'Completed' }),
      Appointment.countDocuments({ ...filter, status: 'Cancelled' }),
    ]);

    res.json({
      success: true,
      data: { total, booked, completed, cancelled },
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientAnalytics = async (req, res, next) => {
  try {
    const { organizationId, branchId, startDate, endDate } = req.query;

    const filter = { isActive: true };
    if (organizationId) filter.organizationId = organizationId;
    if (branchId) filter.branchId = branchId;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const newPatients = await Patient.countDocuments(filter);

    res.json({
      success: true,
      data: { newPatients },
    });
  } catch (error) {
    next(error);
  }
};

export const getRevenueAnalytics = async (req, res, next) => {
  try {
    const { organizationId, startDate, endDate } = req.query;

    const matchStage = {};
    if (organizationId) matchStage.organizationId = organizationId;
    if (startDate || endDate) {
      matchStage.collectedAt = {};
      if (startDate) matchStage.collectedAt.$gte = new Date(startDate);
      if (endDate) matchStage.collectedAt.$lte = new Date(endDate);
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$method',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ];

    const byMethod = await Payment.aggregate(pipeline);

    const totalRevenue = byMethod.reduce((sum, m) => sum + m.total, 0);
    const totalTransactions = byMethod.reduce((sum, m) => sum + m.count, 0);

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalTransactions,
        byMethod: byMethod.map(m => ({
          method: m._id,
          total: m.total,
          count: m.count,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getServiceAnalytics = async (req, res, next) => {
  try {
    const { organizationId, startDate, endDate } = req.query;

    const matchStage = {};
    if (organizationId) matchStage.organizationId = organizationId;
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const pipeline = [
      { $match: matchStage },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: '$lineItems.description',
          count: { $sum: '$lineItems.quantity' },
          revenue: { $sum: '$lineItems.total' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ];

    const services = await Invoice.aggregate(pipeline);

    res.json({
      success: true,
      data: {
        services: services.map(s => ({
          name: s._id,
          count: s.count,
          revenue: s.revenue,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
