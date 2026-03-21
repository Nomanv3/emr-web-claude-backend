import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { validateRecordPayment } from '../validators/index.js';
import {
  recordPayment,
  getPayments,
  getPaymentHistory,
  getInvoiceReceipts,
  getReceipt,
} from '../controllers/payments.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', getPayments);
router.post('/', validate(validateRecordPayment), recordPayment);
router.get('/invoices/:invoiceId/payments', getPaymentHistory);
router.get('/invoices/:invoiceId/receipts', getInvoiceReceipts);
router.get('/receipts/:receiptId', getReceipt);

export default router;
