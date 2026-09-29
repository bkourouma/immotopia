import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { getAccountStatement, getClientsAgingBalance, getClientsBalance } from '../lib/finance/reports';
import { runRentBilling } from '../lib/finance/billing-run';
import { buildAccountStatementPdf } from '../lib/finance/statement-pdf';
import type { AccountStatementResult, BillingRunSummary } from '../lib/finance/types';
import { prisma } from '../utils/database';
import {
  accountStatementQuerySchema,
  billingRunListQuerySchema,
  clientsAgingBalanceQuerySchema,
  clientsBalanceQuerySchema,
  createBillingRunSchema,
  printAccountStatementQuerySchema,
  resolveAsOf,
  resolvePagination,
  resolveRange,
  uuidPathParamSchema
} from '../lib/finance/schemas';

/**
 * Contrôleur des sept points d'entrée agence du module financier
 * opérationnel — lot 1, volet clients.
 *
 * Modèle : `controllers/property-media-controller.ts`. Chaque handler est
 * enveloppé dans `asyncHandler` et lève des erreurs typées
 * (`middleware/error-middleware`) plutôt qu'un `try/catch` qui devinerait le
 * statut HTTP depuis un message — c'est cette dérive qui a produit
 * l'incohérence 400/500 relevée dans le module copropriété, qu'on ne
 * reproduit pas ici.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ou d'un champ métier de
 * même nom — même règle que `tenant-middleware.ts`.
 *
 * Contrat : `specs/016-finance-operationnelle/contracts/openapi.yaml`.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

/** Identifiant de chemin (compte, campagne) : rejeté en 400 s'il n'a pas la forme d'un UUID. */
function requireUuidParam(req: Request, name: string): string {
  const parsed = uuidPathParamSchema.safeParse(req.params[name]);
  if (!parsed.success) {
    throw new BadRequestError(`Le paramètre ${name} doit être un identifiant valide.`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Mise en forme des réponses
// ---------------------------------------------------------------------------

/**
 * Sérialise un relevé de compte pour la frontière API.
 *
 * Le contrat gelé (`lib/finance/types.ts`) et le service frontend déjà livré
 * (`apps/web/src/services/finance-service.ts`, hors du territoire de cet
 * agent) nomment les lignes `movements` et le compteur `total` ; le contrat
 * `openapi.yaml` les nomme `lines`, `totalLines`, et ajoute `page`/`pageSize`.
 * Les deux formes sont exposées côte à côte plutôt que de trancher entre un
 * document déjà consommé et un contrat déjà publié.
 */
export function toAccountStatementResponse(statement: AccountStatementResult, page: number, pageSize: number) {
  return {
    accountId: statement.accountId,
    label: statement.label,
    kind: statement.kind,
    openingBalance: statement.openingBalance,
    closingBalance: statement.closingBalance,
    currency: statement.currency,
    movements: statement.movements,
    lines: statement.movements,
    total: statement.total,
    totalLines: statement.total,
    page,
    pageSize
  };
}

/** Échappe une valeur pour une cellule CSV (RFC 4180 minimal). */
function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function clientsBalanceToCsv(
  lines: Array<{
    label: string;
    propertyLabels: string[];
    totalBilled: number;
    totalSettled: number;
    balance: number;
    currency: string;
  }>
): string {
  const header = ['Locataire', 'Biens', 'Facturé', 'Réglé', 'Solde', 'Devise'];
  const rows = lines.map(line =>
    [line.label, line.propertyLabels.join(' · '), line.totalBilled, line.totalSettled, line.balance, line.currency]
      .map(csvCell)
      .join(',')
  );
  return [header.join(','), ...rows].join('\r\n');
}

function toBillingRunResponse(row: {
  id: string;
  tenantId: string;
  periodYear: number;
  periodMonth: number;
  label: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  createdByUserId: string;
  summary: unknown;
}) {
  return {
    id: row.id,
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    label: row.label,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdByUserId: row.createdByUserId,
    summary: (row.summary as BillingRunSummary | null) ?? null
  };
}

// ---------------------------------------------------------------------------
// A. Balance clients
// ---------------------------------------------------------------------------

export const getClientsBalanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = clientsBalanceQuerySchema.parse(req.query ?? {});
  const range = resolveRange(query);

  const result = await getClientsBalance(tenantId, {
    range: range.from || range.to ? range : undefined,
    propertyId: query.propertyId
  });

  if (query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="balance-clients.csv"');
    res.status(200).send(clientsBalanceToCsv(result.lines));
    return;
  }

  res.status(200).json({ success: true, data: result });
});

// ---------------------------------------------------------------------------
// B. Balance clients âgée
// ---------------------------------------------------------------------------

export const getClientsAgingBalanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = clientsAgingBalanceQuerySchema.parse(req.query ?? {});
  const range = resolveRange(query);
  const asOf = resolveAsOf(query);

  const result = await getClientsAgingBalance(tenantId, {
    range: range.from || range.to ? range : undefined,
    propertyId: query.propertyId,
    asOf
  });

  res.status(200).json({
    success: true,
    data: {
      ...result,
      asOfDate: asOf.toISOString().slice(0, 10)
    }
  });
});

// ---------------------------------------------------------------------------
// C. Relevé de compte (JSON)
// ---------------------------------------------------------------------------

export const getAccountStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const accountId = requireUuidParam(req, 'accountId');
  const query = accountStatementQuerySchema.parse(req.query ?? {});
  const range = resolveRange(query);
  const pagination = resolvePagination(query);

  const statement = await getAccountStatement(tenantId, accountId, {
    range: range.from || range.to ? range : undefined,
    skip: pagination.skip,
    take: pagination.take
  });

  res
    .status(200)
    .json({ success: true, data: toAccountStatementResponse(statement, pagination.page, pagination.pageSize) });
});

// ---------------------------------------------------------------------------
// D. Relevé de compte (PDF)
// ---------------------------------------------------------------------------

/**
 * Plafond de lignes pour l'impression : le PDF montre les mêmes lignes que
 * l'écran JSON sur la même période (US2, scénario 3), jamais une seule page
 * paginée. `buildAccountStatementPdf` s'arrête de toute façon à la première
 * page pleine (voir son en-tête) : ce plafond n'existe que pour ne pas
 * charger un historique sans borne en mémoire.
 */
const PDF_STATEMENT_ROW_LIMIT = 5000;

export const printAccountStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const accountId = requireUuidParam(req, 'accountId');
  const query = printAccountStatementQuerySchema.parse(req.query ?? {});
  const range = resolveRange(query);

  const statement = await getAccountStatement(tenantId, accountId, {
    range: range.from || range.to ? range : undefined,
    skip: 0,
    take: PDF_STATEMENT_ROW_LIMIT
  });

  const pdfBuffer = await buildAccountStatementPdf({
    accountLabel: statement.label,
    currency: statement.currency,
    openingBalance: statement.openingBalance,
    closingBalance: statement.closingBalance,
    periodFrom: range.from,
    periodTo: range.to,
    movements: statement.movements
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="releve-compte-${accountId}.pdf"`);
  res.status(200).send(pdfBuffer);
});

// ---------------------------------------------------------------------------
// E. Campagnes de facturation — liste
// ---------------------------------------------------------------------------

/**
 * Aucune fonction de lecture des campagnes n'existe dans le contrat gelé
 * (`lib/finance/types.ts`) : lui seul décrit `RunRentBilling` (écriture).
 * La liste et le détail sont donc lus ici directement via `prisma`, comme le
 * fait déjà `syndic-controller.ts` pour des lectures équivalentes, toujours
 * filtrés par `tenantId`.
 */
export const listBillingRunsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = billingRunListQuerySchema.parse(req.query ?? {});

  const runs = await prisma.rentBillingRun.findMany({
    where: {
      tenantId,
      ...(query.status ? { status: query.status } : {})
    },
    orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }]
  });

  res.status(200).json({ success: true, data: runs.map(toBillingRunResponse) });
});

// ---------------------------------------------------------------------------
// F. Campagnes de facturation — détail
// ---------------------------------------------------------------------------

export const getBillingRunHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const runId = requireUuidParam(req, 'runId');

  const run = await prisma.rentBillingRun.findFirst({ where: { id: runId, tenantId } });
  if (!run) {
    throw new NotFoundError('Campagne de facturation introuvable ou inaccessible.');
  }

  res.status(200).json({ success: true, data: toBillingRunResponse(run) });
});

// ---------------------------------------------------------------------------
// G. Campagnes de facturation — lancement
// ---------------------------------------------------------------------------

export const createBillingRunHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createBillingRunSchema.parse(req.body ?? {});
  const actorUserId = req.user?.userId;
  if (!actorUserId) {
    throw new BadRequestError('Utilisateur authentifié requis pour lancer une campagne.');
  }

  const run = await runRentBilling(tenantId, body, actorUserId);

  res.status(201).json({ success: true, data: run });
});

// ---------------------------------------------------------------------------
// H. Portail locataire — solde et relevé du locataire connecté
// ---------------------------------------------------------------------------

/**
 * Contexte posé par `middleware/tenant-portal-access.ts` sur la requête.
 * Redéclaré ici en local plutôt qu'importé : ce contrôleur ne dépend d'aucun
 * fichier du portail locataire, dans les deux sens (voir l'en-tête de
 * `handleTenantPortalFinanceStatement`).
 */
interface TenantPortalRequestContext {
  tenantClientId: string;
  tenantId: string;
}

/**
 * Solde et relevé financier du locataire connecté (US6 du lot 1).
 *
 * **Vit ici plutôt que dans `tenant-portal-controller.ts`**, alors que la
 * route est bien montée depuis ce dernier
 * (`TenantPortalController.getFinanceStatement`, un simple appel à cette
 * fonction). Deux raisons :
 *
 *   1. Cette route agence et cette route portail partagent tout : la
 *      résolution du compte, la pagination, la forme de réponse
 *      (`toAccountStatementResponse`). Les garder dans le même fichier évite
 *      de dupliquer cette logique ou de l'exporter dans les deux sens.
 *   2. `tenant-portal-controller.ts` porte une erreur TypeScript
 *      préexistante, sans rapport avec ce lot (`declarePayment`), qui reste
 *      dans les 103 erreurs déjà connues du dépôt (voir `AGENTS.md`). Le
 *      contrôleur applique cette même erreur au chargement du fichier ;
 *      y ajouter cette fonction l'aurait exposée aux tests de ce lot dès
 *      qu'ils auraient importé le contrôleur ou ses routes — un fichier tiers
 *      qui n'appartient à aucun agent de cette vague. La déléguer ici, avec
 *      un import à sens unique (`tenant-portal-controller.ts` → ce fichier,
 *      jamais l'inverse), permet de tester cette route sans jamais compiler
 *      ce fichier tiers.
 *
 * **Aucun identifiant de compte n'est lu sur la requête** : `tenantId` et
 * `tenantClientId` viennent uniquement du contexte posé par
 * `requireTenantPortalAccess`, jamais d'un paramètre, d'une query ou d'un
 * corps fourni par l'appelant. C'est ce qui garantit qu'un locataire ne peut
 * jamais lire le relevé d'un autre.
 *
 * Suit le style de `tenant-portal-controller.ts` (`try/catch` direct, sans
 * `asyncHandler`) plutôt que celui du reste de ce fichier : cette fonction
 * répond toujours elle-même, sans jamais dépendre du middleware d'erreur
 * central, exactement comme ses futures voisines dans le fichier appelant.
 */
export async function handleTenantPortalFinanceStatement(req: Request, res: Response): Promise<void> {
  try {
    const tenantPortal = (req as any).tenantPortal as TenantPortalRequestContext | undefined;

    if (!tenantPortal) {
      res.status(403).json({ success: false, message: 'Accès portail locataire requis.' });
      return;
    }

    const { tenantClientId, tenantId } = tenantPortal;

    const parsedQuery = accountStatementQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      res.status(400).json({
        success: false,
        message: 'La date de début de période doit être antérieure ou égale à la date de fin.'
      });
      return;
    }

    const range = resolveRange(parsedQuery.data);
    const pagination = resolvePagination(parsedQuery.data);

    const account = await prisma.thirdPartyAccount.findFirst({
      where: { tenantId, tenantClientId, kind: 'TENANT' },
      select: { id: true }
    });

    if (!account) {
      res.status(404).json({ success: false, message: 'Compte de tiers introuvable pour ce locataire.' });
      return;
    }

    const statement = await getAccountStatement(tenantId, account.id, {
      range: range.from || range.to ? range : undefined,
      skip: pagination.skip,
      take: pagination.take,
      // Le locataire ne voit que ce qui est échu à ce jour (BUG-2026-09-28-026).
      asOf: new Date()
    });

    res.status(200).json({
      success: true,
      data: toAccountStatementResponse(statement, pagination.page, pagination.pageSize)
    });
  } catch (error: any) {
    const statusCode = error?.statusCode || error?.status || 500;
    const message = error?.message || 'Erreur lors de la récupération du solde.';
    res.status(statusCode).json({
      success: false,
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: error?.stack })
    });
  }
}
