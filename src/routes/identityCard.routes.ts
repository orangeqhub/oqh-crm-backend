import { Router } from 'express';
import { generateIdentityCard, getIdentityCards, getIdentityCardById, deactivateIdentityCard } from '../controllers/identityCard.controller';
import { authenticate, authorize } from '../middleware/auth';
import { query } from '../config/database';

const router = Router();

router.use(authenticate);

router.get('/', getIdentityCards);
router.get('/:id', getIdentityCardById);
router.post('/generate', authorize('admin', 'hr'), generateIdentityCard);
router.put('/:id/deactivate', authorize('admin', 'hr'), deactivateIdentityCard);
router.put('/:id/activate', authorize('admin', 'hr'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      'UPDATE employee_identity_cards SET is_active = true, deactivated_at = NULL WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Identity card not found.' });
      return;
    }
    res.status(200).json({ success: true, message: 'Identity card reactivated.', data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
});

export default router;
