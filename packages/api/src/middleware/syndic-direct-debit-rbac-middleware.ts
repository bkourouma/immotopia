import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { t } from '../i18n';
import { assertSyndicateOfTenant } from '../lib/direct-debit/syndic/creditors';
import { NotFoundError } from './error-middleware';
import { requirePermission } from './rbac-middleware';

/**
 * Gardes du prélèvement bancaire des copropriétés (spec 042, P4, data-model
 * §9.4). Même modèle que `rental-rbac-middleware.ts`.
 */

/** Consulter les prélèvements d'un syndicat (IBAN masqué). */
export const requireSyndicDirectDebitView = requirePermission('SYNDIC_DIRECT_DEBIT_VIEW');

/** Tout le reste : mandats, PDF et fichier à IBAN complet, remises, constats. */
export const requireSyndicDirectDebitManage = requirePermission('SYNDIC_DIRECT_DEBIT_MANAGE');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Le syndicat de la route doit appartenir à l'agence : sinon 404, la même
 * réponse qu'un syndicat inexistant (jamais 403, qui révélerait son existence).
 * À poser APRÈS `requireTenantAccess` et AVANT la permission.
 */
export const requireTenantSyndicate: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  const syndicId = req.params.syndicId;
  if (!tenantId || !syndicId || !UUID.test(syndicId)) {
    next(new NotFoundError(t('Copropriété introuvable ou inaccessible.')));
    return;
  }
  assertSyndicateOfTenant(tenantId, syndicId).then(() => next(), next);
};
