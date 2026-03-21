import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { validateCreateAppointment, validateUpdateAppointment } from '../validators/index.js';
import {
  getSlots,
  getAppointments,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  checkinAppointment,
  createFollowUp,
} from '../controllers/appointments.controller.js';

const router = Router();

router.use(authenticate);

router.get('/slots', getSlots);
router.get('/', getAppointments);
router.post('/', validate(validateCreateAppointment), createAppointment);
router.post('/followup', createFollowUp);
router.post('/:appointmentId/checkin', checkinAppointment);
router.put('/:appointmentId', validate(validateUpdateAppointment), updateAppointment);
router.delete('/:appointmentId', deleteAppointment);

export default router;
