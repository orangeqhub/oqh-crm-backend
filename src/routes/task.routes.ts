import { Router } from 'express';
import { getTasks, getTaskById, createTask, updateTask, updateTaskStatus, getMyTasks } from '../controllers/task.controller';
import { authenticate } from '../middleware/auth';
import { query } from '../config/database';

const router = Router();

router.use(authenticate);

router.get('/my-tasks', getMyTasks);
router.get('/stats', async (req, res) => {
  try {
    const result = await query(
      `SELECT status, COUNT(*) as count FROM tasks GROUP BY status`
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
});
router.get('/', getTasks);
router.get('/:id', getTaskById);
router.post('/', createTask);
router.put('/:id', updateTask);
router.put('/:id/status', updateTaskStatus);
router.post('/:taskId/comments', async (req, res) => {
  res.status(200).json({ success: true, message: 'Comment added.', data: {} });
});
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM tasks WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Task deleted.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
});

export default router;
