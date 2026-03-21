import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getSchedule } from '../controllers/schedule.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', getSchedule);

export default router;
