import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { validateCreateTemplate, validateUpdateTemplate } from '../validators/index.js';
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getGlobalTemplates,
  templateGetHandler,
  templatePostHandler,
  templateEditHandler,
  templateDeleteHandler,
} from '../controllers/templates.controller.js';

const router = Router();

router.use(authenticate);

// Legacy handler routes (used by frontend prescription-Templates calls)
router.get('/template-gethandler', templateGetHandler);
router.post('/template-posthandler', templatePostHandler);
router.put('/template-edithandler', templateEditHandler);
router.delete('/template-deletehandler', templateDeleteHandler);

// Standard CRUD routes
router.get('/global', getGlobalTemplates);
router.get('/', getTemplates);
router.post('/', validate(validateCreateTemplate), createTemplate);
router.put('/:templateId', validate(validateUpdateTemplate), updateTemplate);
router.delete('/:templateId', deleteTemplate);

export default router;
