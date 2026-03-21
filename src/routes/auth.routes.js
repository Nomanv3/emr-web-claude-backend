import { Router } from 'express';
import { login, refresh, logout, register } from '../controllers/auth.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.post('/register', authenticate, authorize('admin', 'system_admin'), register);

export default router;
