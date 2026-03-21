import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  searchSymptoms,
  searchDiagnoses,
  searchMedications,
  searchLabTests,
  getServices,
  createService,
  searchExaminationFindings,
  searchProcedures,
  getSalutations,
} from '../controllers/masters.controller.js';

const router = Router();

router.use(authenticate);

router.get('/symptoms', searchSymptoms);
router.get('/diagnoses', searchDiagnoses);
router.get('/medications', searchMedications);
router.get('/lab-tests', searchLabTests);
router.get('/services', getServices);
router.get('/examination-findings', searchExaminationFindings);
router.get('/procedures', searchProcedures);
router.get('/salutations', getSalutations);
router.post('/services', createService);

export default router;
