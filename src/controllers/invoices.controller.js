import { query, withTransaction } from '../config/mysql.js';
import { mapInvoiceRow } from '../db/mappers/invoice.mapper.js';
import { mapPaymentRow } from '../db/mappers/payment.mapper.js';
import { v4 as uuidv4 } from 'uuid';

async function loadInvoiceMysql(invoiceId) {
  const [[row]] = await query(
    'SELECT * FROM invoice WHERE invoice_id = ? AND deleted_at IS NULL LIMIT 1',
    [invoiceId]
  );
  if (!row) return null;
  const [liRows] = await query(
    'SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY sort_order, id',
    [invoiceId]
  );
  return mapInvoiceRow(row, liRows);
}

function computeTotals({ lineItems = [], discount = 0, tax = 0, paidAmount = 0 }) {
  const subtotal = lineItems.reduce((s, it) => s + (Number(it.total) || 0), 0);
  const totalAmount = subtotal - Number(discount || 0) + Number(tax || 0);
  const balanceDue = totalAmount - Number(paidAmount || 0);
  return { subtotal, totalAmount, balanceDue };
}

export const getInvoice = async (req, res, next) => {
  try {
    const invoice = await loadInvoiceMysql(req.params.invoiceId);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
    }
    return res.json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

export const createInvoice = async (req, res, next) => {
  try {
    const b = req.body;
    const { lineItems = [], discount = 0, tax = 0 } = b;
    const { subtotal, totalAmount } = computeTotals({ lineItems, discount, tax });

    const invoiceId = uuidv4();
    await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO invoice
          (invoice_id, organization_id, patient_id, appointment_id,
           subtotal, discount, tax, total_amount, paid_amount, balance_due, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          b.organizationId,
          b.patientId,
          b.appointmentId || null,
          subtotal,
          Number(discount) || 0,
          Number(tax) || 0,
          totalAmount,
          0,
          totalAmount,
          'Unpaid',
        ]
      );
      for (let i = 0; i < lineItems.length; i++) {
        const li = lineItems[i];
        await conn.query(
          'INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, discount, total, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [invoiceId, li.description || null, Number(li.quantity) || 1, Number(li.unitPrice) || 0, Number(li.discount) || 0, Number(li.total) || 0, i]
        );
      }
    });
    const invoice = await loadInvoiceMysql(invoiceId);
    return res.status(201).json({
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
    const b = req.body;

    const [[existing]] = await query(
      'SELECT * FROM invoice WHERE invoice_id = ? LIMIT 1',
      [req.params.invoiceId]
    );
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
    }

    let subtotal = parseFloat(existing.subtotal);
    let totalAmount = parseFloat(existing.total_amount);
    let balanceDue = parseFloat(existing.balance_due);
    let paidAmount = b.paidAmount != null ? Number(b.paidAmount) : parseFloat(existing.paid_amount);
    const discount = b.discount != null ? Number(b.discount) : parseFloat(existing.discount);
    const tax = b.tax != null ? Number(b.tax) : parseFloat(existing.tax);

    if (Array.isArray(b.lineItems)) {
      const r = computeTotals({ lineItems: b.lineItems, discount, tax, paidAmount });
      subtotal = r.subtotal;
      totalAmount = r.totalAmount;
      balanceDue = r.balanceDue;
    } else if (b.discount != null || b.tax != null || b.paidAmount != null) {
      totalAmount = subtotal - discount + tax;
      balanceDue = totalAmount - paidAmount;
    }

    await withTransaction(async (conn) => {
      const sets = [];
      const params = [];
      const colMap = {
        organizationId: 'organization_id', patientId: 'patient_id',
        appointmentId: 'appointment_id', status: 'status',
      };
      for (const [k, col] of Object.entries(colMap)) {
        if (b[k] !== undefined) { sets.push(`${col} = ?`); params.push(b[k]); }
      }
      sets.push('subtotal = ?', 'discount = ?', 'tax = ?', 'total_amount = ?', 'paid_amount = ?', 'balance_due = ?');
      params.push(subtotal, discount, tax, totalAmount, paidAmount, balanceDue);
      await conn.query(
        `UPDATE invoice SET ${sets.join(', ')} WHERE invoice_id = ?`,
        [...params, req.params.invoiceId]
      );

      if (Array.isArray(b.lineItems)) {
        await conn.query('DELETE FROM invoice_line_items WHERE invoice_id = ?', [req.params.invoiceId]);
        for (let i = 0; i < b.lineItems.length; i++) {
          const li = b.lineItems[i];
          await conn.query(
            'INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, discount, total, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.params.invoiceId, li.description || null, Number(li.quantity) || 1, Number(li.unitPrice) || 0, Number(li.discount) || 0, Number(li.total) || 0, i]
          );
        }
      }
    });

    const invoice = await loadInvoiceMysql(req.params.invoiceId);
    return res.json({
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
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);

    const where = ['deleted_at IS NULL'];
    const params = [];
    if (organizationId) { where.push('organization_id = ?'); params.push(organizationId); }
    if (patientId)      { where.push('patient_id = ?');      params.push(patientId); }
    if (status)         { where.push('status = ?');          params.push(status); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const offset = (parsedPage - 1) * parsedLimit;

    const [rows] = await query(
      `SELECT * FROM invoice ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parsedLimit, offset]
    );
    const [[{ total }]] = await query(`SELECT COUNT(*) AS total FROM invoice ${whereSql}`, params);

    // Bulk-load line items
    let invoices;
    if (rows.length === 0) {
      invoices = [];
    } else {
      const ids = rows.map((r) => r.invoice_id);
      const ph = ids.map(() => '?').join(',');
      const [liRows] = await query(
        `SELECT * FROM invoice_line_items WHERE invoice_id IN (${ph}) ORDER BY sort_order, id`,
        ids
      );
      const liMap = {};
      for (const li of liRows) (liMap[li.invoice_id] ||= []).push(li);
      invoices = rows.map((r) => mapInvoiceRow(r, liMap[r.invoice_id] || []));
    }

    return res.json({
      success: true,
      data: invoices,
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

export const getReceiptData = async (req, res, next) => {
  try {
    const invoice = await loadInvoiceMysql(req.params.invoiceId);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
    }
    const [[patientRow]] = await query(
      'SELECT patient_id, uhid, name, phone, email FROM patient WHERE patient_id = ? LIMIT 1',
      [invoice.patientId]
    );
    const [[orgRow]] = await query(
      'SELECT name, address_street, address_city, address_state, address_country, address_pincode, phone, email, logo FROM organization WHERE organization_id = ? LIMIT 1',
      [invoice.organizationId]
    );
    const [[branchRow]] = await query(
      'SELECT name, address_street, address_city, address_state, address_country, address_pincode FROM branch WHERE organization_id = ? LIMIT 1',
      [invoice.organizationId]
    );
    const [payRows] = await query(
      'SELECT * FROM payment WHERE invoice_id = ? ORDER BY collected_at DESC',
      [invoice.invoiceId]
    );
    const payments = payRows.map(mapPaymentRow);

    const addrObj = (r) => r ? {
      street: r.address_street || null,
      city:   r.address_city || null,
      state:  r.address_state || null,
      country: r.address_country || null,
      pincode: r.address_pincode || null,
    } : null;

    return res.json({
      success: true,
      data: {
        invoice: {
          invoiceId:   invoice.invoiceId,
          lineItems:   invoice.lineItems,
          subtotal:    invoice.subtotal,
          discount:    invoice.discount,
          tax:         invoice.tax,
          totalAmount: invoice.totalAmount,
          paidAmount:  invoice.paidAmount,
          balanceDue:  invoice.balanceDue,
          status:      invoice.status,
          createdAt:   invoice.createdAt,
        },
        patient: patientRow ? {
          patientId: patientRow.patient_id,
          uhid:      patientRow.uhid,
          name:      patientRow.name,
          phone:     patientRow.phone,
          email:     patientRow.email,
        } : null,
        clinic: orgRow ? {
          name:    orgRow.name,
          address: addrObj(orgRow),
          phone:   orgRow.phone,
          email:   orgRow.email,
          logo:    orgRow.logo,
        } : null,
        branch: branchRow ? {
          name:    branchRow.name,
          address: addrObj(branchRow),
        } : null,
        payments: payments.map((p) => ({
          paymentId:      p.paymentId,
          amount:         p.amount,
          method:         p.method,
          transactionRef: p.transactionRef,
          collectedAt:    p.collectedAt,
          receiptId:      p.receiptId,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
