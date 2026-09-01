import { Router } from 'express';
import { getProjects, getProjectById, createProject, updateProject, assignMembers, getProjectStats } from '../controllers/project.controller';
import { authenticate, authorize } from '../middleware/auth';
import { query } from '../config/database';

const router = Router();

router.use(authenticate);

router.get('/stats', getProjectStats);
router.get('/', getProjects);
router.get('/:id', getProjectById);
router.post('/', authorize('admin', 'hr', 'employee'), createProject);
router.put('/:id', updateProject);
router.put('/:id/assign', assignMembers);
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM project_members WHERE project_id = $1', [id]);
    await query('UPDATE tasks SET project_id = NULL WHERE project_id = $1', [id]);
    await query('DELETE FROM projects WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Project deleted.' });
  } catch (error: any) {
    console.error('Delete project error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
});

export default router;
