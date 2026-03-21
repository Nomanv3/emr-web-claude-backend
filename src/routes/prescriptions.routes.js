import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import {
  validateSavePrescription,
  validateUpdatePrescription,
  validateGetFullPrescription,
} from '../validators/index.js';
import {
  savePrescription,
  updatePrescription,
  getFullPrescription,
  getPatientPrescriptions,
  getDropdownOptions,
  searchPrescriptionItems,
  getFrequentlySeen,
  getConfiguration,
  upsertConfiguration,
  getPatientDetailHistory,
  getVitalUnits,
} from '../controllers/prescriptions.controller.js';

const router = Router();

router.use(authenticate);

// New prescription endpoints
router.get('/dropdown-options', getDropdownOptions);
router.get('/search', searchPrescriptionItems);
router.get('/frequently-seen', getFrequentlySeen);
router.get('/configuration', getConfiguration);
router.put('/configuration', upsertConfiguration);

router.get('/vital-units', getVitalUnits);
router.get('/patient-detail-history', getPatientDetailHistory);

// Existing
router.post('/save', validate(validateSavePrescription), savePrescription);
router.put('/update', validate(validateUpdatePrescription), updatePrescription);
router.get('/full', validate(validateGetFullPrescription), getFullPrescription);
router.get('/patient/:patientId', getPatientPrescriptions);

export default router;
