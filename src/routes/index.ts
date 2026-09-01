import { Router, Request, Response } from 'express';
import authRoutes from './auth.routes';
import employeeRoutes from './employee.routes';
import attendanceRoutes from './attendance.routes';
import workUpdateRoutes from './workUpdate.routes';
import projectRoutes from './project.routes';
import taskRoutes from './task.routes';
import clientRoutes from './client.routes';
import identityCardRoutes from './identityCard.routes';
import notificationRoutes from './notification.routes';
import reportRoutes from './report.routes';
import dashboardRoutes from './dashboard.routes';
import companySettingsRoutes from './companySettings.routes';
import { verifyEmployee } from '../controllers/identityCard.controller';

const router = Router();

router.use('/auth', authRoutes);
router.use('/employees', employeeRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/work-updates', workUpdateRoutes);
router.use('/projects', projectRoutes);
router.use('/tasks', taskRoutes);
router.use('/clients', clientRoutes);
router.use('/identity-cards', identityCardRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/company', companySettingsRoutes);

// Public route for QR verification
router.get('/verify/:token', verifyEmployee);

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'OQH CRM API is running', timestamp: new Date().toISOString() });
});

export default router;
