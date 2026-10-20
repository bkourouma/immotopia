/**
 * RBAC for communication module – tenant-scoped access.
 * Allows users with TENANT_ADMIN or COMMUNICATION_VIEW (assigned to Admin, Manager, Agent).
 * @see specs/010-communication-module/tasks.md T015
 */
import type { NextFunction, Request, Response } from 'express';
import { requireAnyPermission } from './rbac-middleware';

export const requireCommunicationPermission = requireAnyPermission(['TENANT_ADMIN', 'COMMUNICATION_VIEW']);

/**
 * Garde d'écriture (créer/modifier/supprimer, envoyer une campagne, envoi de
 * test WhatsApp). Le seed ne définit qu'une clé, COMMUNICATION_VIEW
 * (prisma/seeds/communication-permissions-seed.ts) : l'écriture exige donc les
 * mêmes clés tant qu'une clé d'écriture dédiée n'existe pas. Garde séparée pour
 * pouvoir la durcir sans toucher aux routes.
 */
const requireCommunicationWriteKeys = requireAnyPermission(['TENANT_ADMIN', 'COMMUNICATION_VIEW']);

export function requireCommunicationWritePermission(req: Request, res: Response, next: NextFunction): void {
  // Le super-admin traverse déjà les autres gardes de tenant (contexte posé par requireTenantAccess).
  if (req.tenantContext?.isSuperAdmin) {
    next();
    return;
  }
  void requireCommunicationWriteKeys(req, res, next);
}

/** Lecture (GET) ou écriture selon la méthode HTTP, pour un routeur entier. */
export function requireCommunicationByMethod(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (req.tenantContext?.isSuperAdmin) {
      next();
      return;
    }
    void requireCommunicationPermission(req, res, next);
    return;
  }
  requireCommunicationWritePermission(req, res, next);
}
