import { Request, Response } from 'express';
import { query } from '../config/database';

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const countRes = await query('SELECT COUNT(*) FROM notifications WHERE user_id = $1', [userId]);
    const totalCount = parseInt(countRes.rows[0].count);

    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.status(200).json({
      success: true,
      data: {
        notifications: result.rows,
        pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
      },
    });
  } catch (error: any) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const existing = await query('SELECT id FROM notifications WHERE id = $1 AND user_id = $2', [id, userId]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Notification not found.' });
      return;
    }

    await query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [id, userId]);

    res.status(200).json({ success: true, message: 'Notification marked as read.' });
  } catch (error: any) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const markAllAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    await query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [userId]);

    res.status(200).json({ success: true, message: 'All notifications marked as read.' });
  } catch (error: any) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const createNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, title, message, type, link } = req.body;

    if (!userId || !title) {
      res.status(400).json({ success: false, message: 'userId and title are required.' });
      return;
    }

    const result = await query(
      `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, title, message || null, type || 'info', link || null]
    );

    res.status(201).json({
      success: true,
      message: 'Notification created.',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Create notification error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const result = await query('SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false', [userId]);

    res.status(200).json({
      success: true,
      data: { count: parseInt(result.rows[0].count) },
    });
  } catch (error: any) {
    console.error('Get unread count error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};
