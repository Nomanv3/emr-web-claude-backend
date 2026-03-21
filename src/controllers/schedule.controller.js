import Queue from '../models/Queue.js';
import Appointment from '../models/Appointment.js';

export const getSchedule = async (req, res, next) => {
  try {
    const { organizationId, branchId, date } = req.query;

    if (!organizationId || !branchId || !date) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'organizationId, branchId, and date are required' },
      });
    }

    const [queue, appointments, followups] = await Promise.all([
      Queue.find({ organizationId, branchId, queueDate: date }).sort({ tokenNumber: 1 }),
      Appointment.find({
        organizationId, branchId, slotDate: date,
        status: { $nin: ['Follow Up'] },
      }).sort({ slot: 1 }),
      Appointment.find({
        organizationId, branchId,
        $or: [
          { followUpDate: date },
          { slotDate: date, status: 'Follow Up' },
        ],
      }).sort({ slot: 1 }),
    ]);

    res.json({
      success: true,
      data: { queue, appointments, followups },
    });
  } catch (error) {
    next(error);
  }
};
