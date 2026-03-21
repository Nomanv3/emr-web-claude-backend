import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import {
  validateGetQueue,
  validateAddToQueue,
  validateUpdateQueueEntry,
  validateQueueStats,
} from '../validators/index.js';
import {
  getQueue,
  addToQueue,
  updateQueueEntry,
  removeFromQueue,
  getQueueStats,
} from '../controllers/queue.controller.js';

const router = Router();

router.use(authenticate);

router.get('/stats', validate(validateQueueStats), getQueueStats);
router.get('/', validate(validateGetQueue), getQueue);
router.post('/', validate(validateAddToQueue), addToQueue);
router.put('/:queueId', validate(validateUpdateQueueEntry), updateQueueEntry);
router.delete('/:queueId', removeFromQueue);

export default router;
