import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { prisma } from '../utils/database';
import { recordSiteProgressTx, listSiteProgress } from '../lib/finance/site-progress';
import { acknowledgeBudgetAlertTx, listOpenBudgetAlerts } from '../lib/finance/budget-alerts';
import { getSitesDashboard } from '../lib/finance/site-dashboard';
import type { SiteProgressEntryRecord, SiteBudgetAlertRecord, SiteDashboardRow } from '../lib/finance/types-lot3';
import {
  recordSiteProgressSchema,
  sitesDashboardQuerySchema,
  uuidPathParamSchema
} from '../lib/finance/schemas-pilotage';

/**
 * Contrôleur des cinq points d'entrée « pilotage » du lot 3 : avancement
 * physique, alerte de dépassement, tableau de bord.
 *
 * Modèle : `controllers/finance-sites-controller.ts` (lot 2). Chaque handler
 * est enveloppé dans `asyncHandler` et laisse remonter telles quelles les
 * erreurs typées levées par le domaine (`lib/finance/site-progress.ts`,
 * `budget-alerts.ts`, `site-dashboard.ts`) : aucun `try/catch` ici ne devine
 * un statut HTTP depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ou d'une query fournie par
 * l'appelant — même règle qu'au lot 2.
 *
 * Contrat : `specs/018-finance-budget-pilotage/data-model.md` §5.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

/** Identifiant de chemin (chantier, alerte) : rejeté en 400 s'il n'a pas la forme d'un UUID. */
function requireUuidParam(req: Request, name: string): string {
  const parsed = uuidPathParamSchema.safeParse(req.params[name]);
  if (!parsed.success) {
    throw new BadRequestError(`Le paramètre ${name} doit être un identifiant valide.`);
  }
  return parsed.data;
}

function requireActorUserId(req: Request): string {
  const actorUserId = req.user?.userId;
  if (!actorUserId) {
    throw new BadRequestError('Utilisateur authentifié requis pour cette opération.');
  }
  return actorUserId;
}

// ---------------------------------------------------------------------------
// Mise en forme des réponses
// ---------------------------------------------------------------------------

function toSiteProgressResponse(entry: SiteProgressEntryRecord) {
  return {
    id: entry.id,
    siteId: entry.siteId,
    entryDate: entry.entryDate,
    percent: entry.percent,
    note: entry.note,
    createdByUserId: entry.createdByUserId,
    createdByLabel: entry.createdByLabel,
    createdAt: entry.createdAt
  };
}

function toBudgetAlertResponse(alert: SiteBudgetAlertRecord) {
  return {
    id: alert.id,
    siteId: alert.siteId,
    siteLabel: alert.siteLabel,
    budgetId: alert.budgetId,
    thresholdPercent: alert.thresholdPercent,
    engagedAmount: alert.engagedAmount,
    budgetAmount: alert.budgetAmount,
    consumedPercent: alert.consumedPercent,
    raisedAt: alert.raisedAt,
    acknowledgedAt: alert.acknowledgedAt,
    currency: alert.currency
  };
}

function toDashboardRowResponse(row: SiteDashboardRow) {
  return {
    siteId: row.siteId,
    siteLabel: row.siteLabel,
    zone: row.zone,
    status: row.status,
    initialBudget: row.initialBudget,
    revisedBudget: row.revisedBudget,
    engagedAmount: row.engagedAmount,
    actualCost: row.actualCost,
    progressPercent: row.progressPercent,
    variance: row.variance,
    variancePercent: row.variancePercent,
    openAlert: row.openAlert ? toBudgetAlertResponse(row.openAlert) : null,
    currency: row.currency
  };
}

// ---------------------------------------------------------------------------
// A. Avancement — historique
// ---------------------------------------------------------------------------

export const listSiteProgressHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');

  const entries = await listSiteProgress(tenantId, siteId);

  res.status(200).json({ success: true, data: entries.map(toSiteProgressResponse) });
});

// ---------------------------------------------------------------------------
// B. Avancement — saisie d'un point
// ---------------------------------------------------------------------------

export const recordSiteProgressHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');
  const body = recordSiteProgressSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const entry = await prisma.$transaction(tx =>
    recordSiteProgressTx(tx, tenantId, {
      siteId,
      entryDate: body.entryDate,
      percent: body.percent,
      note: body.note ?? null,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: toSiteProgressResponse(entry) });
});

// ---------------------------------------------------------------------------
// C. Alertes de dépassement — liste des alertes ouvertes
// ---------------------------------------------------------------------------

export const listOpenBudgetAlertsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);

  const alerts = await listOpenBudgetAlerts(tenantId);

  res.status(200).json({ success: true, data: alerts.map(toBudgetAlertResponse) });
});

// ---------------------------------------------------------------------------
// D. Alertes de dépassement — acquittement
// ---------------------------------------------------------------------------

/**
 * Aucun `try/catch` ici : `acknowledgeBudgetAlertTx` (`lib/finance/budget-alerts.ts`)
 * lève déjà `ConflictError` (409) sur une alerte déjà acquittée — « ce qui
 * est acquitté ne bouge plus » — et `NotFoundError` (404) sur une alerte
 * absente. `asyncHandler` les transmet telles quelles au middleware central.
 */
export const acknowledgeBudgetAlertHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const alertId = requireUuidParam(req, 'alertId');
  const actorUserId = requireActorUserId(req);

  const alert = await prisma.$transaction(tx => acknowledgeBudgetAlertTx(tx, tenantId, alertId, actorUserId));

  res.status(200).json({ success: true, data: toBudgetAlertResponse(alert) });
});

// ---------------------------------------------------------------------------
// E. Tableau de bord des chantiers
// ---------------------------------------------------------------------------

export const getSitesDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = sitesDashboardQuerySchema.parse(req.query ?? {});

  const result = await getSitesDashboard(tenantId, { status: query.status, onlyOverBudget: query.onlyOverBudget });

  res.status(200).json({ success: true, data: result.rows.map(toDashboardRowResponse), currency: result.currency });
});
