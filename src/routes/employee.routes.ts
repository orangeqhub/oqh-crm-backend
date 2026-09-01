import { Router } from 'express';
import { getEmployees, getEmployeeById, createEmployee, updateEmployee, deactivateEmployee, getEmployeeStats } from '../controllers/employee.controller';
import { getSalaryAnalysis } from '../controllers/salary.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/stats', getEmployeeStats);
router.get('/salary', authorize('admin', 'hr'), getSalaryAnalysis);
router.get('/', getEmployees);
router.get('/:id', getEmployeeById);
router.post('/', authorize('admin', 'hr'), createEmployee);
router.put('/:id', authorize('admin', 'hr'), updateEmployee);
router.delete('/:id', authorize('admin'), deactivateEmployee);

export default router;
