import { Router } from 'express';
import { getAttendanceReport, getEmployeeReport, getClientReport, getProjectReport, exportCSV } from '../controllers/report.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/attendance', authorize('admin', 'hr'), getAttendanceReport);
router.get('/employees', authorize('admin', 'hr'), getEmployeeReport);
router.get('/clients', authorize('admin', 'hr', 'employee'), getClientReport);
router.get('/projects', authorize('admin', 'hr', 'employee'), getProjectReport);
router.get('/export', authorize('admin', 'hr'), exportCSV);

export default router;
