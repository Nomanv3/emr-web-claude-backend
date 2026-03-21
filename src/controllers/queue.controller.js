import Queue from '../models/Queue.js';
import Patient from '../models/Patient.js';
import Invoice from '../models/Invoice.js';

export const getQueue = async (req, res, next) => {
  try {
    const { organizationId, branchId, date } = req.query;

    if (!organizationId || !branchId || !date) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'organizationId, branchId, and date are required' },
      });
    }

    const queue = await Queue.find({
      organizationId,
      branchId,
      queueDate: date,
    }).sort({ tokenNumber: 1 });

    res.json({
      success: true,
      data: { queue },
    });
  } catch (error) {
    next(error);
  }
};

export const addToQueue = async (req, res, next) => {
  try {
    const { organizationId, branchId, patientId, queueDate } = req.body;

    const lastInQueue = await Queue.findOne({
      organizationId, branchId, queueDate,
    }).sort({ tokenNumber: -1 });

    const tokenNumber = lastInQueue ? lastInQueue.tokenNumber + 1 : 1;

    let patientName = req.body.patientName;
    let uhid = req.body.uhid;

    if (!patientName && patientId) {
      const patient = await Patient.findOne({ patientId });
      if (patient) {
        patientName = patient.name;
        uhid = patient.uhid;
      }
    }

    // Compute serviceAmount from services array
    const services = req.body.services || [];
    const serviceAmount = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);

    const queueEntry = new Queue({
      ...req.body,
      tokenNumber,
      patientName,
      uhid,
      serviceAmount,
      arrivalTime: new Date(),
      createdBy: req.user?.userId,
    });

    await queueEntry.save();

    // Auto-create invoice if services are provided
    if (services.length > 0) {
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

        queueEntry.invoiceId = invoice.invoiceId;
        await queueEntry.save();
      } catch (invoiceErr) {
        console.error('Auto-invoice creation failed:', invoiceErr.message);
      }
    }

    res.status(201).json({
      success: true,
      data: queueEntry,
      message: 'Patient added to queue',
    });
  } catch (error) {
    next(error);
  }
};

export const updateQueueEntry = async (req, res, next) => {
  try {
    const queueEntry = await Queue.findOneAndUpdate(
      { queueId: req.params.queueId },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!queueEntry) {
      return res.status(404).json({
        success: false,
        error: { code: 'QUEUE_NOT_FOUND', message: 'Queue entry not found' },
      });
    }

    res.json({
      success: true,
      data: queueEntry,
      message: 'Queue entry updated',
    });
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

    const match = { organizationId, branchId, queueDate: date };

    const stats = await Queue.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const result = { waiting: 0, ongoing: 0, completed: 0, cancelled: 0, total: 0 };
    for (const s of stats) {
      const key = s._id?.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        result[key] = s.count;
      }
      result.total += s.count;
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const removeFromQueue = async (req, res, next) => {
  try {
    const queueEntry = await Queue.findOneAndUpdate(
      { queueId: req.params.queueId },
      { status: 'Cancelled' },
      { new: true }
    );

    if (!queueEntry) {
      return res.status(404).json({
        success: false,
        error: { code: 'QUEUE_NOT_FOUND', message: 'Queue entry not found' },
      });
    }

    res.json({
      success: true,
      message: 'Removed from queue',
    });
  } catch (error) {
    next(error);
  }
};
