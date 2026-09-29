import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ForbiddenError, AppError } from './error-middleware';
import { getLlmProvider } from '../lib/ai/providers';
import { t } from '../i18n';

/**
 * Garde d'accès à l'assistant ImmoCopilot. À poser APRÈS `authenticate`,
 * `requireTenantAccess` et `requireTenantCollaborator` : celles-ci écartent
 * déjà les clients de portail (locataires, propriétaires, copropriétaires).
 *
 * - Refuse le super-admin (MVP : l'assistant est réservé aux collaborateurs
 *   d'une agence ; le super-admin passe `requireTenantCollaborator` par
 *   dérogation, d'où cette garde explicite).
 * - Répond 503 `AI_DISABLED` quand `AI_PROVIDER=disabled`, sauf pour le
 *   statut, qui doit pouvoir répondre `enabled: false` au menu web.
 */

/** Assistant désactivé : 503 typé, lu par le client via `code`. */
export class AiDisabledError extends AppError {
  constructor() {
    super(t("L'assistant IA n'est pas activé."), 503, 'AI_DISABLED');
  }
}

function isSuperAdmin(req: Request): boolean {
  return req.user?.globalRole === 'SUPER_ADMIN' || Boolean(req.tenantContext?.isSuperAdmin);
}

function createGuard(options: { allowDisabled: boolean }): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user?.userId || !req.tenantContext) {
      next(new ForbiddenError());
      return;
    }
    if (isSuperAdmin(req) || !req.tenantContext.isCollaborator || req.tenantContext.isClient) {
      next(new ForbiddenError("L'assistant IA n'est pas disponible pour ce compte."));
      return;
    }
    if (!options.allowDisabled && getLlmProvider() === null) {
      next(new AiDisabledError());
      return;
    }
    next();
  };
}

/** Chat et exécution : super-admin refusé, 503 `AI_DISABLED` si le fournisseur est désactivé. */
export const requireAiAssistantAccess = createGuard({ allowDisabled: false });

/** Statut : mêmes refus, mais répond même désactivé (`enabled: false`). */
export const requireAiStatusAccess = createGuard({ allowDisabled: true });
