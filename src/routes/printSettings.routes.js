import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getPrintSettings, savePrintSettings } from '../controllers/printSettings.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', getPrintSettings);
router.post('/', savePrintSettings);

export default router;
