import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  roleId: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret') as AuthUser;

    // Verify user still exists and is active
    const userResult = await query('SELECT id, is_active FROM users WHERE id = $1', [decoded.id]);
    if (userResult.rows.length === 0) {
      res.status(401).json({ success: false, message: 'User not found.' });
      return;
    }

    if (!userResult.rows[0].is_active) {
      res.status(401).json({ success: false, message: 'Account is deactivated.' });
      return;
    }

    req.user = decoded;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, message: 'Token expired.' });
      return;
    }
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({ success: false, message: 'Invalid token.' });
      return;
    }
    res.status(500).json({ success: false, message: 'Authentication error.' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.' });
      return;
    }

    next();
  };
};
