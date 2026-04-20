import { query, withTransaction } from '../config/mysql.js';
import { mapPaymentRow, mapReceiptRow } from '../db/mappers/payment.mapper.js';
import { mapInvoiceRow } from '../db/mappers/invoice.mapper.js';
import { v4 as uuidv4 } from 'uuid';

async function genReceiptNumberMysql(conn) {
  // RCT-YYYY-NNNNNN — N counts receipts for the current year
  const year = new Date().getUTCFullYear();
  const [[{ cnt }]] = await conn.query(
    'SELECT COUNT(*) AS cnt FROM receipt WHERE YEAR(generated_at) = ?',
    [year]
  );
  return `RCT-${year}-${String(Number(cnt) + 1).padStart(6, '0')}`;
}

export const recordPayment = async (req, res, next) => {
  try {
    const { invoiceId, amount, method, transactionRef } = req.body;
    const collectedBy = req.body.collectedBy || req.user?.userId || null;

    const [[invRow]] = await query(
      'SELECT * FROM invoice WHERE invoice_id = ? AND deleted_at IS NULL LIMIT 1',
      [invoiceId]
    );
    if (!invRow) {
      return res.status(404).json({
        success: false,
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
    }

    const paymentId = uuidv4();
    const receiptId = uuidv4();
    let newStatus = 'Partial';
    let newPaid = parseFloat(invRow.paid_amount) + Number(amount);
    let newBalance = parseFloat(invRow.total_amount) - newPaid;
    if (newBalance <= 0) { newStatus = 'Paid'; newBalance = 0; }

    await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO payment
           (payment_id, invoice_id, amount, method, transaction_ref, collected_by, collected_at, receipt_id)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
        [paymentId, invoiceId, Number(amount), method, transactionRef || null, collectedBy, receiptId]
      );
      const receiptNumber = await genReceiptNumberMysql(conn);
      await conn.query(
        `INSERT INTO receipt (receipt_id, payment_id, invoice_id, receipt_number, generated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [receiptId, paymentId, invoiceId, receiptNumber]
      );
      await conn.query(
        'UPDATE invoice SET paid_amount = ?, balance_due = ?, status = ? WHERE invoice_id = ?',
        [newPaid, newBalance, newStatus, invoiceId]
      );
    });

    const [[pRow]] = await query('SELECT * FROM payment WHERE payment_id = ? LIMIT 1', [paymentId]);
    const [[rRow]] = await query('SELECT * FROM receipt WHERE receipt_id = ? LIMIT 1', [receiptId]);
    const [[iRow]] = await query('SELECT * FROM invoice WHERE invoice_id = ? LIMIT 1', [invoiceId]);
    const [liRows] = await query(
      'SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY sort_order, id',
      [invoiceId]
    );

    return res.status(201).json({
      success: true,
      data: {
        payment: mapPaymentRow(pRow),
        receipt: mapReceiptRow(rRow),
        invoice: mapInvoiceRow(iRow, liRows),
      },
      message: 'Payment recorded successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getPayments = async (req, res, next) => {
  try {
    const { organizationId, startDate, endDate, page = 1, limit = 50 } = req.query;
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);

    const where = [];
    const params = [];
    if (organizationId) {
      where.push('invoice_id IN (SELECT invoice_id FROM invoice WHERE organization_id = ?)');
      params.push(organizationId);
    }
    if (startDate) { where.push('collected_at >= ?'); params.push(new Date(startDate)); }
    if (endDate)   { where.push('collected_at <= ?'); params.push(new Date(endDate)); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (parsedPage - 1) * parsedLimit;

    const [rows] = await query(
      `SELECT * FROM payment ${whereSql} ORDER BY collected_at DESC LIMIT ? OFFSET ?`,
      [...params, parsedLimit, offset]
    );
    const [[{ total }]] = await query(`SELECT COUNT(*) AS total FROM payment ${whereSql}`, params);

    return res.json({
      success: true,
      data: rows.map(mapPaymentRow),
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

export const getPaymentHistory = async (req, res, next) => {
  try {
    const [rows] = await query(
      'SELECT * FROM payment WHERE invoice_id = ? ORDER BY collected_at DESC',
      [req.params.invoiceId]
    );
    return res.json({ success: true, data: { payments: rows.map(mapPaymentRow) } });
  } catch (error) {
    next(error);
  }
};

export const getInvoiceReceipts = async (req, res, next) => {
  try {
    const [rows] = await query(
      'SELECT * FROM receipt WHERE invoice_id = ? ORDER BY generated_at DESC',
      [req.params.invoiceId]
    );
    return res.json({ success: true, data: { receipts: rows.map(mapReceiptRow) } });
  } catch (error) {
    next(error);
  }
};

export const getReceipt = async (req, res, next) => {
  try {
    const [[row]] = await query(
      'SELECT * FROM receipt WHERE receipt_id = ? LIMIT 1',
      [req.params.receiptId]
    );
    if (!row) {
      return res.status(404).json({
        success: false,
        error: { code: 'RECEIPT_NOT_FOUND', message: 'Receipt not found' },
      });
    }
    return res.json({ success: true, data: mapReceiptRow(row) });
  } catch (error) {
    next(error);
  }
};
