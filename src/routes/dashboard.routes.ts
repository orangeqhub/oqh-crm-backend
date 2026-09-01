import { Router } from 'express';
import { getAdminDashboard, getHRDashboard, getEmployeeDashboard } from '../controllers/dashboard.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/admin', authorize('admin'), getAdminDashboard);
router.get('/hr', authorize('admin', 'hr'), getHRDashboard);
router.get('/employee', getEmployeeDashboard);

export default router;
