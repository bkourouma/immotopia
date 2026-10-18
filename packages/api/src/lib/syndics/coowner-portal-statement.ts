import type { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import { resolveDocumentBranding, type DocumentBranding } from '../documents/document-branding';
import { contactDisplayName } from './charge-receipt-snapshot';
import { computeScopedBalances, type CoOwnerPortalScope } from './coowner-portal';
import { LOT_NOT_FOUND, lotInScope } from './coowner-portal-finance';
import type { CoOwnerStatementQuery } from './coowner-portal-schemas';
import { roundMoney } from './finance-utils';
import { buildOwnerAccountStatementPdf } from './owner-account-statement';
import {
  applyChronologicalBalances,
  chronologicalBalanceStrictlyBefore,
  type RunningBalanceMovement
} from './owner-account-running-balance';

/**
 * Relevé de compte d'un lot en PDF, côté portail copropriétaire (lot S5).
 *
 * Même générateur que la gestion (`buildOwnerAccountStatementPdf`) avec
 * l'identité S1 (mandant de la copropriété, sinon l'agence). Deux
 * différences, voulues :
 *   - lecture seule : le compte n'est JAMAIS créé ici (la gestion le crée à
 *     sa première consultation) ; sans compte, le relevé sort vide, à zéro ;
 *   - le nom imprimé est celui de la fiche du copropriétaire connecté, pas
 *     celui du titulaire enregistré sur le compte ;
 *   - lot ayant changé de propriétaire (`visibleSince` non nul) : la période ne
 *     remonte jamais avant cette borne, et les soldes (ouverture, lignes,
 *     clôture) sont ceux du PÉRIMÈTRE, cumulés depuis zéro à la borne : ni la
 *     dette ni l'avance de l'ancien propriétaire n'y figurent. Sans autre
 *     propriétaire avant (`visibleSince` nul) : aucune borne, tout le compte ;
 *   - seules les `STATEMENT_MAX_ROWS` lignes les PLUS RÉCENTES de la période
 *     sont imprimées (le générateur en tient 30 sur sa page), avec pour solde
 *     d'ouverture celui qui précède la première ligne imprimée ;
 *   - document informatif : ni signature ni cachet de l'émetteur (images
 *     extractibles d'un PDF), seuls les logos sont conservés (audit S5).
 *
 * Les soldes imprimés sont ceux de l'écran du compte de lot
 * (`getCoOwnerLotAccount`) : solde cumulé chronologique recalculé sur TOUT le
 * compte (`applyChronologicalBalances`, BUG-2026-09-27-006), jamais le
 * `balanceAfter` figé dans l'ordre de saisie.
 */

/** Lignes imprimées par le générateur de relevé (une page). */
export const STATEMENT_MAX_ROWS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Filtre `transactionDate` d'un relevé : `to` inclusif (jour entier). */
export function statementDateWhere(from?: Date, to?: Date): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lt: new Date(to.getTime() + DAY_MS) } : {})
  };
}

export type StatementRow = {
  id: string;
  transactionDate: Date;
  type: string;
  label: string;
  debit: Prisma.Decimal | number | string | null;
  credit: Prisma.Decimal | number | string | null;
  balanceAfter: Prisma.Decimal | number | string;
};

/** Mouvements du compte (depuis `since` s'il est donné) : base du solde cumulé chronologique. */
async function loadAllMovements(accountId: string, since?: Date): Promise<RunningBalanceMovement[]> {
  return prisma.ownerAccountTransaction.findMany({
    where: { accountId, ...(since ? { transactionDate: { gte: since } } : {}) },
    select: { id: true, transactionDate: true, createdAt: true, debit: true, credit: true, balanceAfter: true }
  });
}

/**
 * Soldes du relevé, recalculés dans l'ordre chronologique comme à l'écran.
 * Ouverture : solde avant la première ligne imprimée ; sans ligne, solde
 * atteint juste avant le début de la période.
 */
export function statementBalances(
  rows: StatementRow[],
  allMovements: RunningBalanceMovement[],
  from: Date
): { rows: StatementRow[]; opening: number; closing: number } {
  const balanced = applyChronologicalBalances(rows, allMovements);
  if (balanced.length === 0) {
    const opening = chronologicalBalanceStrictlyBefore(allMovements, from);
    return { rows: balanced, opening, closing: opening };
  }
  const first = balanced[0];
  const opening = roundMoney(Number(first.balanceAfter) - Number(first.debit ?? 0) + Number(first.credit ?? 0));
  const closing = roundMoney(Number(balanced[balanced.length - 1].balanceAfter));
  return { rows: balanced, opening, closing };
}

/**
 * Soldes du relevé d'un lot ayant changé de propriétaire : mêmes règles que
 * `statementBalances`, mais cumul chronologique PARTI DE ZÉRO à `visibleSince`
 * (`computeScopedBalances`). `from` est au plus tôt `visibleSince`. Ouverture
 * à zéro au début de la borne ; `movements` peut se limiter au périmètre.
 */
export function scopedStatementBalances(
  rows: StatementRow[],
  movements: RunningBalanceMovement[],
  from: Date,
  visibleSince: Date
): { rows: StatementRow[]; opening: number; closing: number } {
  const scoped = computeScopedBalances(movements, visibleSince);
  const balanced = rows.map(row => (scoped.has(row.id) ? { ...row, balanceAfter: scoped.get(row.id) as number } : row));
  if (balanced.length === 0) {
    const opening = roundMoney(
      movements
        .filter(
          movement =>
            new Date(movement.transactionDate).getTime() >= visibleSince.getTime() &&
            new Date(movement.transactionDate).getTime() < from.getTime()
        )
        .reduce((sum, movement) => sum + Number(movement.debit ?? 0) - Number(movement.credit ?? 0), 0)
    );
    return { rows: balanced, opening, closing: opening };
  }
  const first = balanced[0];
  const opening = roundMoney(Number(first.balanceAfter) - Number(first.debit ?? 0) + Number(first.credit ?? 0));
  const closing = roundMoney(Number(balanced[balanced.length - 1].balanceAfter));
  return { rows: balanced, opening, closing };
}

/** Les lignes les plus récentes de la période, remises dans l'ordre chronologique. */
async function loadStatementRows(accountId: string, from: Date | null, to?: Date): Promise<StatementRow[]> {
  const dates = statementDateWhere(from ?? undefined, to);
  const latest = await prisma.ownerAccountTransaction.findMany({
    where: { accountId, ...(dates ? { transactionDate: dates } : {}) },
    // Même ordre total que l'écran et que `compareChronologically`.
    orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: STATEMENT_MAX_ROWS,
    select: { id: true, transactionDate: true, type: true, label: true, debit: true, credit: true, balanceAfter: true }
  });
  return latest.reverse();
}

/**
 * Début effectif de la période : jamais avant la borne de visibilité du lot
 * (`visibleSince`). Sans borne, la période demandée telle quelle (`null` si
 * aucune date n'est demandée : tout le compte).
 */
export function statementStart(from: Date | undefined, visibleSince: Date | null): Date | null {
  if (!visibleSince) return from ?? null;
  return from && from.getTime() > visibleSince.getTime() ? from : visibleSince;
}

/** Identité du relevé du portail : logos conservés, ni signature ni cachet. */
export function informativeBranding(branding: DocumentBranding): DocumentBranding {
  return { ...branding, signature: null, stamp: null };
}

async function ownerNameOf(tenantId: string, contactId: string): Promise<string> {
  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId },
    select: { firstName: true, lastName: true, legalName: true }
  });
  return contactDisplayName(contact) ?? 'Proprietaire';
}

/** Lignes et soldes du relevé : tout le compte sans borne, le périmètre du propriétaire actuel sinon. */
async function statementFigures(accountId: string, from: Date | null, visibleSince: Date | null, to?: Date) {
  const rows = await loadStatementRows(accountId, from, to);
  if (visibleSince) {
    // `statementStart` garantit `from >= visibleSince` dès qu'une borne existe.
    return scopedStatementBalances(
      rows,
      await loadAllMovements(accountId, visibleSince),
      from ?? visibleSince,
      visibleSince
    );
  }
  return statementBalances(rows, await loadAllMovements(accountId), from ?? new Date(0));
}

export async function buildCoOwnerLotStatement(scope: CoOwnerPortalScope, lotId: string, query: CoOwnerStatementQuery) {
  const lotScope = lotInScope(scope, lotId);
  const lot = await prisma.syndicateLot.findFirst({
    where: { id: lotScope.lotId, syndicateId: lotScope.syndicateId },
    select: { id: true, lotNumber: true }
  });
  const syndicate = await prisma.syndicate.findFirst({
    where: { id: lotScope.syndicateId, tenantId: scope.tenantId },
    select: { id: true, name: true }
  });
  if (!lot || !syndicate) throw new NotFoundError(LOT_NOT_FOUND);

  const account = await prisma.ownerAccount.findFirst({
    where: { lotId: lot.id, syndicateId: syndicate.id },
    select: { id: true, currency: true }
  });
  const from = statementStart(query.from, lotScope.visibleSince);
  const { rows, opening, closing } = account
    ? await statementFigures(account.id, from, lotScope.visibleSince, query.to)
    : { rows: [] as StatementRow[], opening: 0, closing: 0 };

  const branding = informativeBranding(await resolveDocumentBranding(scope.tenantId, syndicate.id));
  const buffer = await buildOwnerAccountStatementPdf(
    {
      syndicateName: syndicate.name,
      lotNumber: lot.lotNumber,
      ownerName: await ownerNameOf(scope.tenantId, lotScope.contactId),
      currency: account?.currency || 'XOF',
      openingBalance: opening,
      closingBalance: closing,
      transactions: rows.map(row => ({
        transactionDate: row.transactionDate,
        type: row.type,
        label: row.label,
        debit: row.debit === null ? null : Number(row.debit),
        credit: row.credit === null ? null : Number(row.credit),
        balanceAfter: Number(row.balanceAfter)
      }))
    },
    branding
  );
  const safeNumber = lot.lotNumber.replace(/[^A-Za-z0-9 _.-]/g, '-').trim() || 'lot';
  return { buffer, fileName: `Releve lot ${safeNumber}.pdf`, mimeType: 'application/pdf' };
}
