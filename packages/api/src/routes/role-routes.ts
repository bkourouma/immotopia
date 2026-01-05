import { Router } from 'express';
import { listRolesHandler } from '../controllers/role-controller';
import { authenticate } from '../middleware/auth-middleware';

const router = Router();

// All role routes require authentication
router.use(authenticate);

// List roles
router.get('/', listRolesHandler);

export default router;
