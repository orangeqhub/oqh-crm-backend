import { Router } from 'express';
import { getClients, getClientById, createClient, updateClient, addClientActivity, getClientActivities, getClientStats } from '../controllers/client.controller';
import { authenticate, authorize } from '../middleware/auth';
import { query } from '../config/database';

const router = Router();

router.use(authenticate);

router.get('/stats', getClientStats);
router.get('/', getClients);
router.get('/:id', getClientById);
router.post('/', authorize('admin', 'hr', 'employee'), createClient);
router.put('/:id', updateClient);
router.post('/:id/activities', addClientActivity);
router.get('/:id/activities', getClientActivities);
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM client_activities WHERE client_id = $1', [id]);
    await query('DELETE FROM clients WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Client deleted.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
});

export default router;
