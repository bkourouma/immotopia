import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-middleware';
import { badRequest } from '../lib/errors';
import {
  accountingEntriesPageQuerySchema,
  accountLedgerQuerySchema,
  chartOfAccountsSearchQuerySchema,
  getAccountLedger,
  getTrialBalanceAggregated,
  listAccountingEntriesPage,
  searchChartOfAccounts,
  trialBalanceQuerySchema
} from '../lib/syndics/accounting-reads';

/**
 * Lectures comptables de la copropriete (lot SYN-A) : journal pagine, grand
 * livre d'un compte avec solde progressif, balance agregee, recherche dans le
 * plan comptable. Les gardes (session, agence, permission) restent posees par
 * `routes/syndic-routes.ts` ; l'appartenance de la copropriete et du compte a
 * l'agence est verifiee par `lib/syndics/accounting-reads.ts`. Parametres
 * invalides : 400 (Zod, via le middleware d'erreurs).
 */

function scopeOf(req: Request, missingTenantMessage: string) {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw badRequest(missingTenantMessage);
  return { tenantId, syndicateId: req.params.syndicId };
}

/** GET …/comptabilite/ecritures */
export const listAccountingEntriesPageHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = accountingEntriesPageQuerySchema.parse(req.query ?? {});
  const { tenantId, syndicateId } = scopeOf(req, 'TenantId manquant pour la liste des ecritures comptables');
  const { items, pagination } = await listAccountingEntriesPage(tenantId, syndicateId, query);
  res.json({ success: true, data: items, pagination });
});

/** GET …/comptabilite/grand-livre */
export const getAccountLedgerHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = accountLedgerQuerySchema.parse(req.query ?? {});
  const { tenantId, syndicateId } = scopeOf(req, 'TenantId manquant pour le grand livre');
  res.json({ success: true, data: await getAccountLedger(tenantId, syndicateId, query) });
});

/** GET …/comptabilite/balance */
export const getTrialBalanceAggregatedHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = trialBalanceQuerySchema.parse(req.query ?? {});
  const { tenantId, syndicateId } = scopeOf(req, 'TenantId manquant pour la balance comptable');
  res.json({ success: true, data: await getTrialBalanceAggregated(tenantId, syndicateId, query) });
});

/** GET …/comptabilite/comptes */
export const listChartOfAccountsSearchHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = chartOfAccountsSearchQuerySchema.parse(req.query ?? {});
  const { tenantId, syndicateId } = scopeOf(req, 'TenantId manquant pour la liste des comptes comptables');
  res.json({ success: true, data: await searchChartOfAccounts(tenantId, syndicateId, query) });
});
