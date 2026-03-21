import Appointment from '../models/Appointment.js';
import Queue from '../models/Queue.js';
import Patient from '../models/Patient.js';
import Invoice from '../models/Invoice.js';

// Helper: auto-create invoice from services array
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

    const filter = { slotDate: date, status: { $nin: ['Cancelled'] } };
    if (doctorId) filter.doctorId = doctorId;
    if (branchId) filter.branchId = branchId;

    const booked = await Appointment.find(filter).select('slot appointmentId').lean();
    const bookedMap = new Map(booked.map(a => [a.slot, a.appointmentId]));

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

    const filter = {};
    if (organizationId) filter.organizationId = organizationId;
    if (branchId) filter.branchId = branchId;
    if (doctorId) filter.doctorId = doctorId;
    if (status) filter.status = status;
    if (date) filter.slotDate = date;

    if (startDateUTC || endDateUTC) {
      filter.slotStartUTC = {};
      if (startDateUTC) filter.slotStartUTC.$gte = new Date(startDateUTC);
      if (endDateUTC) filter.slotStartUTC.$lte = new Date(endDateUTC);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [appointments, total] = await Promise.all([
      Appointment.find(filter).sort({ slotDate: 1, slot: 1 }).skip(skip).limit(parseInt(limit)),
      Appointment.countDocuments(filter),
    ]);

    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);
    res.json({
      success: true,
      data: appointments,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
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

    const conflict = await Appointment.findOne({
      organizationId, branchId, doctorId, slotDate, slot,
      status: { $nin: ['Cancelled'] },
    });

    if (conflict) {
      return res.status(409).json({
        success: false,
        error: { code: 'SLOT_CONFLICT', message: 'This slot is already booked' },
      });
    }

    const appointment = new Appointment({
      ...req.body,
      createdBy: req.user?.userId,
    });
    await appointment.save();

    // Auto-create queue entry
    const lastInQueue = await Queue.findOne({
      organizationId, branchId, queueDate: slotDate,
    }).sort({ tokenNumber: -1 });
    const tokenNumber = lastInQueue ? lastInQueue.tokenNumber + 1 : 1;

    let patientName = req.body.patientName;
    let uhid = '';
    if (req.body.patientId) {
      const patient = await Patient.findOne({ patientId: req.body.patientId });
      if (patient) {
        patientName = patientName || patient.name;
        uhid = patient.uhid || '';
      }
    }

    const services = req.body.services || [];
    const serviceAmount = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);

    // Auto-create invoice for services
    const invoice = await autoCreateInvoice(organizationId, branchId, req.body.patientId, services);

    const queueEntry = new Queue({
      organizationId,
      branchId,
      patientId: req.body.patientId,
      patientName,
      uhid,
      appointmentId: appointment.appointmentId,
      tokenNumber,
      slot,
      queueDate: slotDate,
      status: 'Waiting',
      paymentStatus: 'Pending',
      appointmentType: 'scheduled',
      checkInTime: req.body.startTime || slot,
      tags: req.body.tags || '',
      durationMinutes: req.body.durationMinutes || 15,
      services,
      serviceAmount,
      paymentAmount: serviceAmount,
      invoiceId: invoice?.invoiceId || '',
      arrivalTime: new Date(),
      notes: req.body.notes || '',
      createdBy: req.user?.userId,
    });
    await queueEntry.save();

    res.status(201).json({
      success: true,
      data: { appointment, queueEntry },
      message: 'Appointment created and added to queue successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Check in a scheduled appointment (move to queue as Waiting)
export const checkinAppointment = async (req, res, next) => {
  try {
    const { appointmentId } = req.params;

    const appointment = await Appointment.findOne({ appointmentId });
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' },
      });
    }

    // Check if already has a queue entry
    let queueEntry = await Queue.findOne({ appointmentId });
    if (queueEntry) {
      // Update status to Waiting if not already active
      if (queueEntry.status === 'Cancelled') {
        queueEntry.status = 'Waiting';
        queueEntry.arrivalTime = new Date();
        await queueEntry.save();
      }
    } else {
      // Create queue entry
      const lastInQueue = await Queue.findOne({
        organizationId: appointment.organizationId,
        branchId: appointment.branchId,
        queueDate: appointment.slotDate,
      }).sort({ tokenNumber: -1 });
      const tokenNumber = lastInQueue ? lastInQueue.tokenNumber + 1 : 1;

      let patientName = appointment.patientName;
      let uhid = '';
      const patient = await Patient.findOne({ patientId: appointment.patientId });
      if (patient) {
        patientName = patientName || patient.name;
        uhid = patient.uhid || '';
      }

      const services = appointment.services || [];
      const serviceAmount = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
      const invoice = await autoCreateInvoice(
        appointment.organizationId, appointment.branchId, appointment.patientId, services
      );

      queueEntry = new Queue({
        organizationId: appointment.organizationId,
        branchId: appointment.branchId,
        patientId: appointment.patientId,
        patientName,
        uhid,
        appointmentId: appointment.appointmentId,
        tokenNumber,
        slot: appointment.slot,
        queueDate: appointment.slotDate,
        status: 'Waiting',
        paymentStatus: 'Pending',
        appointmentType: 'scheduled',
        services: services.map(s => ({ serviceId: s.serviceId, name: s.name, price: s.price })),
        serviceAmount,
        invoiceId: invoice?.invoiceId || '',
        arrivalTime: new Date(),
        createdBy: req.user?.userId,
      });
      await queueEntry.save();
    }

    // Update appointment status
    appointment.status = 'Ongoing';
    await appointment.save();

    res.json({
      success: true,
      data: { appointment, queueEntry },
      message: 'Patient checked in successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Create follow-up appointment
export const createFollowUp = async (req, res, next) => {
  try {
    const {
      parentAppointmentId, patientId, organizationId, branchId,
      doctorId, followUpDate, notes, services, slot, slotDate,
    } = req.body;

    const orgId = organizationId || req.user?.organizationId;
    const brId = branchId || req.user?.branchId;
    const docId = doctorId || req.user?.userId;

    // Validate parent appointment exists
    if (parentAppointmentId) {
      const parent = await Appointment.findOne({ appointmentId: parentAppointmentId });
      if (!parent) {
        return res.status(404).json({
          success: false,
          error: { code: 'PARENT_NOT_FOUND', message: 'Parent appointment not found' },
        });
      }
    }

    const appointment = new Appointment({
      organizationId: orgId,
      branchId: brId,
      patientId,
      doctorId: docId,
      isFollowUp: true,
      parentAppointmentId: parentAppointmentId || '',
      followUpDate: followUpDate || slotDate,
      slotDate: slotDate || followUpDate,
      slot: slot || '',
      services: services || [],
      status: 'Follow Up',
      notes: notes || '',
      createdBy: req.user?.userId,
    });
    await appointment.save();

    // Look up patient name
    let patientName = '';
    const patient = await Patient.findOne({ patientId });
    if (patient) patientName = patient.name;

    res.status(201).json({
      success: true,
      data: { ...appointment.toObject(), patientName },
      message: 'Follow-up appointment created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const updateAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findOneAndUpdate(
      { appointmentId: req.params.appointmentId },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' },
      });
    }

    res.json({
      success: true,
      data: appointment,
      message: 'Appointment updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findOneAndUpdate(
      { appointmentId: req.params.appointmentId },
      { status: 'Cancelled' },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' },
      });
    }

    res.json({
      success: true,
      message: 'Appointment cancelled',
    });
  } catch (error) {
    next(error);
  }
};
