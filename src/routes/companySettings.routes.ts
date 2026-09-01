import { Router } from 'express';
import { getSettings, updateSettings, getDepartments, getDesignations, createDepartment, updateDepartment, deleteDepartment, createDesignation, updateDesignation, deleteDesignation } from '../controllers/companySettings.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/departments', getDepartments);
router.post('/departments', authorize('admin'), createDepartment);
router.put('/departments/:id', authorize('admin'), updateDepartment);
router.delete('/departments/:id', authorize('admin'), deleteDepartment);

router.get('/designations', getDesignations);
router.post('/designations', authorize('admin'), createDesignation);
router.put('/designations/:id', authorize('admin'), updateDesignation);
router.delete('/designations/:id', authorize('admin'), deleteDesignation);

router.get('/settings', getSettings);
router.put('/settings', authorize('admin'), updateSettings);

export default router;
