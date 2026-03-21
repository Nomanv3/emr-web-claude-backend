import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { validateCreatePatient, validateUpdatePatient } from '../validators/index.js';
import {
  getPatients,
  searchPatients,
  createPatient,
  getPatientById,
  updatePatient,
  deletePatient,
  getPatientPrescriptions,
} from '../controllers/patients.controller.js';

const router = Router();

router.use(authenticate);

router.get('/search', searchPatients);
router.get('/', getPatients);
router.post('/', validate(validateCreatePatient), createPatient);
router.get('/:patientId', getPatientById);
router.put('/:patientId', validate(validateUpdatePatient), updatePatient);
router.delete('/:patientId', deletePatient);
router.get('/:patientId/prescriptions', getPatientPrescriptions);

export default router;
