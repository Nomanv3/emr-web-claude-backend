import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { validateAnalyticsSummary } from '../validators/index.js';
import {
  getAppointmentAnalytics,
  getPatientAnalytics,
  getRevenueAnalytics,
  getServiceAnalytics,
  getAnalyticsSummary,
} from '../controllers/analytics.controller.js';

const router = Router();

router.use(authenticate);

router.get('/summary', validate(validateAnalyticsSummary), getAnalyticsSummary);
router.get('/appointments', getAppointmentAnalytics);
router.get('/patients', getPatientAnalytics);
router.get('/revenue', getRevenueAnalytics);
router.get('/services', getServiceAnalytics);

export default router;
