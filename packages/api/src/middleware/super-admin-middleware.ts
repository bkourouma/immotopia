import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../utils/database';
import { ForbiddenError, UnauthorizedError } from './error-middleware';

/**
 * Reserve une route au super-administrateur de la plateforme.
 *
 * A poser APRES `requirePermission('PLATFORM_*')` : la permission garde
 * l'inventaire des routes et le RBAC habituel, ce middleware ajoute que seul
 * un compte `globalRole = SUPER_ADMIN` ACTIF passe — un role plateforme
 * delegue portant la meme permission ne suffit pas. Le role est relu en base,
 * jamais cru depuis le jeton : un compte retrograde perd l'acces tout de suite.
 */
export async function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedError();
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { globalRole: true, isActive: true } });
    if (user?.globalRole !== 'SUPER_ADMIN' || !user.isActive) {
      throw new ForbiddenError('Action réservée au super-administrateur de la plateforme.');
    }
    next();
  } catch (error) {
    next(error);
  }
}
