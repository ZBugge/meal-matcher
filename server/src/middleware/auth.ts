import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.hostId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  // Just continue - hostId may or may not be set
  next();
}
