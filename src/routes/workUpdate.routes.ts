import { Router } from 'express';
import { createWorkUpdate, updateWorkUpdate, getEmployeeWorkUpdates, getAllWorkUpdates, getWorkUpdateStats } from '../controllers/workUpdate.controller';
import { authenticate, authorize } from '../middleware/auth';
import { query } from '../config/database';

const router = Router();

router.use(authenticate);

router.post('/', createWorkUpdate);
router.put('/:id', updateWorkUpdate);
router.get('/employee/:employeeId', getEmployeeWorkUpdates);
router.get('/stats', getWorkUpdateStats);
router.get('/', authorize('admin', 'hr', 'employee'), getAllWorkUpdates);
router.delete('/:id', authorize('admin', 'hr'), async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM employee_work_updates WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Work update deleted.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
});

export default router;
