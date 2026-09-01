import { Router } from 'express';
import { loginUser, logoutUser, refreshToken, getCurrentUser, updateProfile, changePassword } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/login', loginUser);
router.post('/logout', authenticate, logoutUser);
router.post('/refresh', refreshToken);
router.get('/me', authenticate, getCurrentUser);
router.put('/profile', authenticate, updateProfile);
router.put('/change-password', authenticate, changePassword);

export default router;
