import type { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import { sumAllocationsByCall } from './charge-allocation';
import { fromCents, toCents } from './charge-allocation-plan';
import { buildLotMonthGrid, type MonthCell, type TrackedCall } from './charge-monthly-tracking';
import {
  ensureReceiptPdf,
  receiptDownloadName,
  STORED_RECEIPT_SELECT,
  type StoredReceipt
} from './charge-receipt-delivery';
import { periodWhere } from './charge-receipt-queries';
import { isoDay, paymentMethodLabel } from './charge-receipt-snapshot';
import type { CoOwnerLotScope, CoOwnerPortalScope } from './coowner-portal';
import type { CoOwnerPaymentsQuery, CoOwnerReceiptsQuery } from './coowner-portal-schemas';
import { lastDayOfMonth, utcDay } from './period';

/**
 * Portail copropriétaire enrichi (lot S5, besoin 2) — paiements, reçus et
 * quittances, suivi mensuel. Lecture seule, aucun paiement en ligne (P4).
 *
 * Même règle que `coowner-portal.ts` : le périmètre (`CoOwnerPortalScope`)
 * vient de la garde, recalculé à chaque requête. Un lot, un document ou une
 * copropriété hors de ce périmètre répond le même 404 qu'un objet
 * inexistant. Les modèles enfants (`ChargePayment`, `ChargeCall`...) n'ont
 * pas de champ d'agence : ils ne sont lus qu'avec des identifiants de lots
 * et de copropriétés déjà vérifiés.
 *
 * Reçus et quittances : un document porte le NOM du copropriétaire à qui il
 * a été émis. Le portail ne rend donc que les documents des lots du
 * copropriétaire émis à l'une de SES fiches (ou sans destinataire) : les
 * quittances de l'ancien propriétaire d'un lot restent réservées à la
 * gestion.
 */

export const LOT_NOT_FOUND = 'Lot introuvable.';
export const RECEIPT_NOT_FOUND = 'Document introuvable.';
const DEFAULT_CURRENCY = 'XOF';
const MAX_PAYMENTS = 500;

/** Chemin (relatif à la base de l'API) de la route qui sert le PDF d'un document. */
export function coOwnerReceiptDownloadPath(receiptId: string): string {
  return `/portal/copropriete/quittances/${receiptId}/fichier`;
}

/** Le lot doit être dans le périmètre ; sinon 404, comme un lot inexistant. */
export function lotInScope(scope: CoOwnerPortalScope, lotId: string): CoOwnerLotScope {
  const lot = scope.lots.find(candidate => candidate.lotId === lotId);
  if (!lot) throw new NotFoundError(LOT_NOT_FOUND);
  return lot;
}

/** Documents visibles : lots du périmètre, émis à l'une des fiches du copropriétaire ou sans destinataire. */
function visibleReceiptsWhere(scope: CoOwnerPortalScope, lotIds: string[]): Prisma.SyndicChargeReceiptWhereInput {
  return {
    tenantId: scope.tenantId,
    syndicateId: { in: scope.syndicateIds },
    lotId: { in: lotIds },
    OR: [{ contactId: { in: scope.contactIds } }, { contactId: null }]
  };
}

async function loadScopedLots(scope: CoOwnerPortalScope, lotIds: string[]) {
  if (lotIds.length === 0) return [];
  return prisma.syndicateLot.findMany({
    where: { id: { in: lotIds }, syndicateId: { in: scope.syndicateIds } },
    select: { id: true, syndicateId: true, lotNumber: true },
    orderBy: { lotNumber: 'asc' }
  });
}

async function loadSyndicateNames(scope: CoOwnerPortalScope, syndicateIds: string[]) {
  if (syndicateIds.length === 0) return new Map<string, string>();
  const rows = await prisma.syndicate.findMany({
    where: { tenantId: scope.tenantId, id: { in: syndicateIds } },
    select: { id: true, name: true }
  });
  return new Map(rows.map(row => [row.id, row.name]));
}

async function lotContext(scope: CoOwnerPortalScope, lotIds: string[]) {
  const lots = await loadScopedLots(scope, lotIds);
  const names = await loadSyndicateNames(scope, Array.from(new Set(lots.map(lot => lot.syndicateId))));
  const lotView = new Map(
    lots.map(lot => [
      lot.id,
      {
        lot: { id: lot.id, lotNumber: lot.lotNumber },
        syndicate: { id: lot.syndicateId, name: names.get(lot.syndicateId) ?? null }
      }
    ])
  );
  // Les lignes lues ne portent que des lots de `lots` : le repli ne sert qu'au typage.
  const viewOf = (lotId: string) =>
    lotView.get(lotId) ?? { lot: { id: lotId, lotNumber: '' }, syndicate: { id: '', name: null as string | null } };
  return { lots, viewOf };
}

// ---------------------------------------------------------------------------
// 1. Mes paiements
// ---------------------------------------------------------------------------

/**
 * Paiements des lots `lotIds` versés depuis que le copropriétaire les détient
 * (`ownedSince`) : ceux de l'ancien propriétaire restent à la gestion (audit S5).
 */
export function ownedPaymentsWhere(scope: CoOwnerPortalScope, lotIds: string[]): Prisma.ChargePaymentWhereInput {
  const owned = scope.lots.filter(lot => lotIds.includes(lot.lotId));
  return { OR: owned.map(lot => ({ lotId: lot.lotId, paidAt: { gte: lot.ownedSince } })) };
}

function yearWhere(year?: number): Prisma.ChargePaymentWhereInput {
  if (!year) return {};
  return { paidAt: { gte: utcDay(year, 1, 1), lt: utcDay(year + 1, 1, 1) } };
}

async function loadPaymentDetails(scope: CoOwnerPortalScope, paymentIds: string[], lotIds: string[]) {
  if (paymentIds.length === 0) return { allocations: [], calls: new Map(), receipts: [] };
  const allocations = await prisma.chargePaymentAllocation.findMany({
    where: { paymentId: { in: paymentIds } },
    select: { paymentId: true, chargeCallId: true, amount: true, source: true },
    orderBy: { createdAt: 'asc' }
  });
  const callRows = await prisma.chargeCall.findMany({
    where: {
      id: { in: Array.from(new Set(allocations.map(row => row.chargeCallId))) },
      lotId: { in: lotIds },
      syndicateId: { in: scope.syndicateIds }
    },
    select: { id: true, period: true, periodStart: true, periodEnd: true, dueDate: true, currency: true }
  });
  const receipts = await prisma.syndicChargeReceipt.findMany({
    where: { ...visibleReceiptsWhere(scope, lotIds), chargePaymentId: { in: paymentIds } },
    select: { id: true, kind: true, number: true, chargePaymentId: true },
    orderBy: { issuedAt: 'asc' }
  });
  return { allocations, calls: new Map(callRows.map(call => [call.id, call])), receipts };
}

type PaymentDetails = Awaited<ReturnType<typeof loadPaymentDetails>>;

function allocationsOf(paymentId: string, details: PaymentDetails) {
  return details.allocations
    .filter(row => row.paymentId === paymentId)
    .flatMap(row => {
      const call = details.calls.get(row.chargeCallId);
      if (!call) return [];
      return {
        chargeCallId: call.id,
        period: call.period,
        periodStart: isoDay(call.periodStart),
        periodEnd: isoDay(call.periodEnd),
        dueDate: isoDay(call.dueDate),
        amount: fromCents(toCents(row.amount)),
        source: row.source
      };
    });
}

async function loadAdvances(scope: CoOwnerPortalScope, lotIds: string[]) {
  if (lotIds.length === 0) return new Map<string, number>();
  const rows = await prisma.chargePayment.findMany({
    where: { AND: [ownedPaymentsWhere(scope, lotIds), { unallocatedAmount: { gt: 0 } }] },
    select: { lotId: true, unallocatedAmount: true }
  });
  const byLot = new Map<string, number>();
  for (const row of rows) byLot.set(row.lotId, (byLot.get(row.lotId) ?? 0) + toCents(row.unallocatedAmount));
  return byLot;
}

export async function listCoOwnerPayments(scope: CoOwnerPortalScope, query: CoOwnerPaymentsQuery) {
  const requested = query.lotId ? [lotInScope(scope, query.lotId).lotId] : scope.lotIds;
  const { lots, viewOf } = await lotContext(scope, requested);
  const lotIds = lots.map(lot => lot.id);
  if (lotIds.length === 0) return { items: [], advances: [] };

  const payments = await prisma.chargePayment.findMany({
    where: { AND: [ownedPaymentsWhere(scope, lotIds), yearWhere(query.year)] },
    select: {
      id: true,
      lotId: true,
      amount: true,
      unallocatedAmount: true,
      paidAt: true,
      method: true,
      reference: true
    },
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    take: MAX_PAYMENTS
  });
  const details = await loadPaymentDetails(
    scope,
    payments.map(payment => payment.id),
    lotIds
  );
  const advanceByLot = await loadAdvances(scope, lotIds);

  const items = payments.map(payment => {
    const allocations = allocationsOf(payment.id, details);
    const firstCall = allocations[0] ? details.calls.get(allocations[0].chargeCallId) : undefined;
    return {
      id: payment.id,
      paidAt: payment.paidAt,
      amount: fromCents(toCents(payment.amount)),
      currency: firstCall?.currency ?? DEFAULT_CURRENCY,
      method: payment.method ?? null,
      methodLabel: paymentMethodLabel(payment.method),
      reference: payment.reference ?? null,
      ...viewOf(payment.lotId),
      allocations,
      remainingAdvance: fromCents(toCents(payment.unallocatedAmount)),
      documents: details.receipts
        .filter(receipt => receipt.chargePaymentId === payment.id)
        .map(receipt => ({
          id: receipt.id,
          kind: receipt.kind,
          number: receipt.number,
          downloadPath: coOwnerReceiptDownloadPath(receipt.id)
        }))
    };
  });
  const advances = lots.map(lot => ({
    ...viewOf(lot.id),
    advance: fromCents(advanceByLot.get(lot.id) ?? 0),
    currency: DEFAULT_CURRENCY
  }));
  return { items, advances };
}

// ---------------------------------------------------------------------------
// 2. Mes reçus et quittances
// ---------------------------------------------------------------------------

type ReceiptRow = {
  id: string;
  kind: string;
  number: string;
  lotId: string;
  syndicateId: string;
  chargeCallId: string | null;
  chargePaymentId: string | null;
  periodLabel: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  amount: Prisma.Decimal | number | string;
  currency: string;
  issuedAt: Date;
  emailedAt: Date | null;
};

const RECEIPT_LIST_SELECT = {
  id: true,
  kind: true,
  number: true,
  lotId: true,
  syndicateId: true,
  chargeCallId: true,
  chargePaymentId: true,
  periodLabel: true,
  periodStart: true,
  periodEnd: true,
  amount: true,
  currency: true,
  issuedAt: true,
  emailedAt: true
} as const;

export async function listCoOwnerReceipts(scope: CoOwnerPortalScope, query: CoOwnerReceiptsQuery) {
  const requested = query.lotId ? [lotInScope(scope, query.lotId).lotId] : scope.lotIds;
  const { lots, viewOf } = await lotContext(scope, requested);
  const lotIds = lots.map(lot => lot.id);
  const empty = { items: [], pagination: { page: query.page, limit: query.limit, total: 0, totalPages: 1 } };
  if (lotIds.length === 0) return empty;

  const period = periodWhere(query.from, query.to);
  const where: Prisma.SyndicChargeReceiptWhereInput = {
    ...visibleReceiptsWhere(scope, lotIds),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(period ? { AND: [period] } : {})
  };
  const [rows, total] = await Promise.all([
    prisma.syndicChargeReceipt.findMany({
      where,
      select: RECEIPT_LIST_SELECT,
      orderBy: [{ issuedAt: 'desc' }, { number: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit
    }),
    prisma.syndicChargeReceipt.count({ where })
  ]);

  // Vue sans données internes : ni destinataire, ni erreur d'envoi, ni auteur, ni fichier.
  const items = (rows as ReceiptRow[]).map(row => ({
    id: row.id,
    kind: row.kind,
    number: row.number,
    ...viewOf(row.lotId),
    chargeCallId: row.chargeCallId,
    chargePaymentId: row.chargePaymentId,
    periodLabel: row.periodLabel,
    periodStart: isoDay(row.periodStart),
    periodEnd: isoDay(row.periodEnd),
    amount: fromCents(toCents(row.amount)),
    currency: row.currency,
    issuedAt: row.issuedAt,
    emailedAt: row.emailedAt,
    downloadPath: coOwnerReceiptDownloadPath(row.id)
  }));
  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit))
    }
  };
}

/** PDF d'un document du copropriétaire : fichier stocké, sinon reconstruit depuis le snapshot (lot S3). */
export async function getCoOwnerReceiptFile(scope: CoOwnerPortalScope, receiptId: string) {
  if (scope.lotIds.length === 0) throw new NotFoundError(RECEIPT_NOT_FOUND);
  const receipt = (await prisma.syndicChargeReceipt.findFirst({
    where: { id: receiptId, ...visibleReceiptsWhere(scope, scope.lotIds) },
    select: STORED_RECEIPT_SELECT
  })) as StoredReceipt | null;
  if (!receipt) throw new NotFoundError(RECEIPT_NOT_FOUND);
  return {
    buffer: await ensureReceiptPdf(receipt),
    fileName: receiptDownloadName(receipt),
    mimeType: 'application/pdf'
  };
}

// ---------------------------------------------------------------------------
// 3. Suivi mensuel d'un lot
// ---------------------------------------------------------------------------

async function loadLotCallsOfYear(lot: CoOwnerLotScope, year: number) {
  const yearStart = utcDay(year, 1, 1);
  const yearEnd = lastDayOfMonth(year, 12);
  return prisma.chargeCall.findMany({
    where: {
      lotId: lot.lotId,
      syndicateId: lot.syndicateId,
      OR: [
        { periodStart: { lte: yearEnd }, periodEnd: { gte: yearStart } },
        { periodStart: null, dueDate: { gte: yearStart, lt: utcDay(year + 1, 1, 1) } }
      ]
    },
    select: { id: true, lotId: true, amount: true, currency: true, dueDate: true, periodStart: true, periodEnd: true }
  });
}

/**
 * Cases antérieures à l'acquisition vidées (NONE, 0) : les mois de l'ancien
 * propriétaire ne sont pas ceux du copropriétaire connecté (audit S5).
 */
export function hideMonthsBeforeOwnership(months: MonthCell[], year: number, ownedSince: Date): MonthCell[] {
  const startYear = ownedSince.getUTCFullYear();
  if (year > startYear) return months;
  const firstMonth = year < startYear ? 13 : ownedSince.getUTCMonth() + 1;
  return months.map(cell =>
    cell.month < firstMonth ? { month: cell.month, due: 0, paid: 0, status: 'NONE' as const } : cell
  );
}

/** Ligne de la grille mensuelle (S2) pour CE lot seulement, depuis son acquisition. */
export async function getCoOwnerLotMonthlyTracking(scope: CoOwnerPortalScope, lotId: string, year: number) {
  const lotScope = lotInScope(scope, lotId);
  // Une année entièrement antérieure à l'acquisition : même 404 qu'un lot inconnu.
  if (year < lotScope.ownedSince.getUTCFullYear()) throw new NotFoundError(LOT_NOT_FOUND);
  const { lots, viewOf } = await lotContext(scope, [lotScope.lotId]);
  if (lots.length === 0) throw new NotFoundError(LOT_NOT_FOUND);

  const calls = await loadLotCallsOfYear(lotScope, year);
  const [paidByCall, advanceCents] = await Promise.all([
    sumAllocationsByCall(
      prisma,
      calls.map(call => call.id)
    ),
    loadAdvances(scope, [lotScope.lotId])
  ]);
  const tracked: TrackedCall[] = calls.map(call => ({
    id: call.id,
    lotId: call.lotId,
    amountCents: toCents(call.amount),
    paidCents: paidByCall.get(call.id) ?? 0,
    dueDate: call.dueDate,
    periodStart: call.periodStart,
    periodEnd: call.periodEnd
  }));
  const months = hideMonthsBeforeOwnership(buildLotMonthGrid(tracked, year), year, lotScope.ownedSince);
  const dueCents = months.reduce((sum, cell) => sum + toCents(cell.due), 0);
  const paidCents = months.reduce((sum, cell) => sum + toCents(cell.paid), 0);

  return {
    year,
    currency: calls[0]?.currency ?? DEFAULT_CURRENCY,
    ...viewOf(lotScope.lotId),
    ownedSince: isoDay(lotScope.ownedSince),
    advance: fromCents(advanceCents.get(lotScope.lotId) ?? 0),
    totals: { due: fromCents(dueCents), paid: fromCents(paidCents), outstanding: fromCents(dueCents - paidCents) },
    months
  };
}
