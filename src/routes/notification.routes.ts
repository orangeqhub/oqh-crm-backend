import { Router } from 'express';
import { getNotifications, markAsRead, markAllAsRead, createNotification, getUnreadCount } from '../controllers/notification.controller';
import { authenticate, authorize } from '../middleware/auth';
import { query } from '../config/database';

const router = Router();

router.use(authenticate);

router.get('/unread-count', getUnreadCount);
router.get('/', getNotifications);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);
router.post('/', authorize('admin', 'hr'), createNotification);
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM notifications WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Notification deleted.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
});

export default router;
