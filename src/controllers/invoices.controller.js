import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Patient from '../models/Patient.js';
import Organization from '../models/Organization.js';
import Branch from '../models/Branch.js';

export const getInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ invoiceId: req.params.invoiceId });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
    }

    res.json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

export const createInvoice = async (req, res, next) => {
  try {
    const { lineItems = [], discount = 0, tax = 0 } = req.body;

    const subtotal = lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
    const totalAmount = subtotal - discount + tax;

    const invoice = new Invoice({
      ...req.body,
      subtotal,
      totalAmount,
      balanceDue: totalAmount,
    });

    await invoice.save();

    res.status(201).json({
      success: true,
      data: invoice,
      message: 'Invoice created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const updateInvoice = async (req, res, next) => {
  try {
    if (req.body.lineItems) {
      const subtotal = req.body.lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
      req.body.subtotal = subtotal;
      const discount = req.body.discount || 0;
      const tax = req.body.tax || 0;
      req.body.totalAmount = subtotal - discount + tax;
      req.body.balanceDue = req.body.totalAmount - (req.body.paidAmount || 0);
    }

    const invoice = await Invoice.findOneAndUpdate(
      { invoiceId: req.params.invoiceId },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
    }

    res.json({
      success: true,
      data: invoice,
      message: 'Invoice updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getInvoicesList = async (req, res, next) => {
  try {
    const { organizationId, patientId, status, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (organizationId) filter.organizationId = organizationId;
    if (patientId) filter.patientId = patientId;
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [invoices, total] = await Promise.all([
      Invoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Invoice.countDocuments(filter),
    ]);

    const parsedLimit = parseInt(limit);
    res.json({
      success: true,
      data: invoices,
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

export const getReceiptData = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ invoiceId: req.params.invoiceId });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
    }

    const [payments, patient, organization, branch] = await Promise.all([
      Payment.find({ invoiceId: invoice.invoiceId }).sort({ collectedAt: -1 }),
      Patient.findOne({ patientId: invoice.patientId }),
      Organization.findOne({ organizationId: invoice.organizationId }),
      invoice.organizationId
        ? Branch.findOne({ organizationId: invoice.organizationId }).limit(1)
        : null,
    ]);

    res.json({
      success: true,
      data: {
        invoice: {
          invoiceId: invoice.invoiceId,
          lineItems: invoice.lineItems,
          subtotal: invoice.subtotal,
          discount: invoice.discount,
          tax: invoice.tax,
          totalAmount: invoice.totalAmount,
          paidAmount: invoice.paidAmount,
          balanceDue: invoice.balanceDue,
          status: invoice.status,
          createdAt: invoice.createdAt,
        },
        patient: patient ? {
          patientId: patient.patientId,
          uhid: patient.uhid,
          name: patient.name,
          phone: patient.phone,
          email: patient.email,
        } : null,
        clinic: organization ? {
          name: organization.name,
          address: organization.address,
          phone: organization.phone,
          email: organization.email,
          logo: organization.logo,
        } : null,
        branch: branch ? {
          name: branch.name,
          address: branch.address,
        } : null,
        payments: payments.map(p => ({
          paymentId: p.paymentId,
          amount: p.amount,
          method: p.method,
          transactionRef: p.transactionRef,
          collectedAt: p.collectedAt,
          receiptId: p.receiptId,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
