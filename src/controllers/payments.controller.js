import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import Receipt from '../models/Receipt.js';

export const recordPayment = async (req, res, next) => {
  try {
    const { invoiceId, amount, method, transactionRef } = req.body;

    const invoice = await Invoice.findOne({ invoiceId });
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
    }

    const payment = new Payment({
      invoiceId,
      amount,
      method,
      transactionRef,
      collectedBy: req.body.collectedBy || req.user?.userId,
    });

    await payment.save();

    const receipt = new Receipt({
      paymentId: payment.paymentId,
      invoiceId,
    });
    await receipt.save();

    payment.receiptId = receipt.receiptId;
    await payment.save();

    invoice.paidAmount += amount;
    invoice.balanceDue = invoice.totalAmount - invoice.paidAmount;
    if (invoice.balanceDue <= 0) {
      invoice.status = 'Paid';
      invoice.balanceDue = 0;
    } else {
      invoice.status = 'Partial';
    }
    await invoice.save();

    res.status(201).json({
      success: true,
      data: { payment, receipt, invoice },
      message: 'Payment recorded successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getPayments = async (req, res, next) => {
  try {
    const { organizationId, startDate, endDate, page = 1, limit = 50 } = req.query;

    let invoiceIds;
    if (organizationId) {
      const invoices = await Invoice.find({ organizationId }).select('invoiceId').lean();
      invoiceIds = invoices.map(inv => inv.invoiceId);
    }

    const filter = {};
    if (invoiceIds) filter.invoiceId = { $in: invoiceIds };
    if (startDate || endDate) {
      filter.collectedAt = {};
      if (startDate) filter.collectedAt.$gte = new Date(startDate);
      if (endDate) filter.collectedAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [payments, total] = await Promise.all([
      Payment.find(filter).sort({ collectedAt: -1 }).skip(skip).limit(parseInt(limit)),
      Payment.countDocuments(filter),
    ]);

    const parsedLimit = parseInt(limit);
    res.json({
      success: true,
      data: payments,
      pagination: {
        page: parseInt(page),
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getPaymentHistory = async (req, res, next) => {
  try {
    const payments = await Payment.find({ invoiceId: req.params.invoiceId })
      .sort({ collectedAt: -1 });

    res.json({ success: true, data: { payments } });
  } catch (error) {
    next(error);
  }
};

export const getInvoiceReceipts = async (req, res, next) => {
  try {
    const receipts = await Receipt.find({ invoiceId: req.params.invoiceId })
      .sort({ generatedAt: -1 });

    res.json({ success: true, data: { receipts } });
  } catch (error) {
    next(error);
  }
};

export const getReceipt = async (req, res, next) => {
  try {
    const receipt = await Receipt.findOne({ receiptId: req.params.receiptId });

    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: { code: 'RECEIPT_NOT_FOUND', message: 'Receipt not found' },
      });
    }

    res.json({ success: true, data: receipt });
  } catch (error) {
    next(error);
  }
};
