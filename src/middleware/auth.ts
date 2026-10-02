import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    role: 'parent' | 'eleve' | 'admin';
  };
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Non authentifié.'
    });
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as {
      id: number;
      role: 'parent' | 'eleve' | 'admin';
    };

    req.user = payload;

    next();
  } catch {
    return res.status(401).json({
      message: 'Session invalide ou expirée.'
    });
  }
}