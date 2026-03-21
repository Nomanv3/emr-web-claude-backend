import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { validateCreatePatientHistory, validateUpdatePatientHistory } from '../validators/index.js';
import {
  getPatientHistory,
  createPatientHistory,
  updatePatientHistory,
} from '../controllers/patientHistory.controller.js';

const router = Router();

router.use(authenticate);

router.get('/:patientId', getPatientHistory);
router.post('/', validate(validateCreatePatientHistory), createPatientHistory);
router.put('/:patientId', validate(validateUpdatePatientHistory), updatePatientHistory);

export default router;
