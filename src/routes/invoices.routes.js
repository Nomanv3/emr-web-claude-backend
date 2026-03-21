import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { validateCreateInvoice, validateUpdateInvoice } from '../validators/index.js';
import {
  getInvoice,
  createInvoice,
  updateInvoice,
  getInvoicesList,
  getReceiptData,
} from '../controllers/invoices.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', getInvoicesList);
router.get('/:invoiceId', getInvoice);
router.get('/:invoiceId/receipt-data', getReceiptData);
router.post('/', validate(validateCreateInvoice), createInvoice);
router.put('/:invoiceId', validate(validateUpdateInvoice), updateInvoice);

export default router;
