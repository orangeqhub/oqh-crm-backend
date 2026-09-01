import { Router } from 'express';
import { checkIn, checkOut, getAttendance, getAttendanceReport, markAttendance } from '../controllers/attendance.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/report', authorize('admin', 'hr'), getAttendanceReport);
router.get('/', getAttendance);
router.post('/mark', authorize('admin', 'hr'), markAttendance);

export default router;
