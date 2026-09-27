import type { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { AppError, NotFoundError, ValidationError } from '../../middleware/error-middleware';
import { assertLotOfSyndicate, assertSyndicateOfTenant, lockLotTx } from './charge-allocation';
import { issueQuittancesForSettledCallsTx } from './charge-receipts';
import {
  brandingForSnapshot,
  ensureReceiptPdf,
  loadSyndicateRenderContext,
  receiptDownloadName,
  sendReceiptEmail,
  snapshotOf,
  STORED_RECEIPT_SELECT,
  type StoredReceipt
} from './charge-receipt-delivery';
import { renderChargeReceiptSheets } from './charge-receipt-pdf';
import type { ReceiptListQuery, ReceiptPrintQuery } from './charge-receipt-schemas';
import { isoDay } from './charge-receipt-snapshot';
import { toCents, fromCents } from './charge-allocation-plan';

/**
 * Lectures et actions sur les reçus et quittances d'une copropriété (lot S3).
 * Chaque point d'entrée vérifie d'abord que la copropriété (et le lot) sont
 * de l'agence ; un document d'une autre copropriété ou d'une autre agence
 * répond le même 404 qu'un document inexistant. Aucune réponse ne porte de
 * chemin disque.
 */

/** Au-delà, l'impression groupée est refusée (422) : période ou filtre à resserrer. */
export const MAX_DOCUMENTS_PER_PRINT = 500;

const RECEIPT_NOT_FOUND = 'Document introuvable.';
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- filtres

/**
 * Filtre de période : un document borné (quittance d'un appel structuré)
 * est retenu si sa période chevauche [from, to] ; un document sans bornes
 * (reçu, quittance d'un appel au libellé libre) si sa date d'émission y
 * tombe.
 */
export function periodWhere(from?: Date, to?: Date): Prisma.SyndicChargeReceiptWhereInput | undefined {
  if (!from && !to) return undefined;
  const bounded: Prisma.SyndicChargeReceiptWhereInput = {
    periodStart: { not: null, ...(to ? { lte: to } : {}) },
    ...(from ? { periodEnd: { gte: from } } : {})
  };
  const unbounded: Prisma.SyndicChargeReceiptWhereInput = {
    periodStart: null,
    issuedAt: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lt: new Date(to.getTime() + DAY_MS) } : {})
    }
  };
  return { OR: [bounded, unbounded] };
}

function listWhere(
  tenantId: string,
  syndicateId: string,
  filters: Pick<ReceiptListQuery, 'lotId' | 'contactId' | 'kind' | 'from' | 'to'>
): Prisma.SyndicChargeReceiptWhereInput {
  const period = periodWhere(filters.from, filters.to);
  return {
    tenantId,
    syndicateId,
    ...(filters.lotId ? { lotId: filters.lotId } : {}),
    ...(filters.contactId ? { contactId: filters.contactId } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(period ? { AND: [period] } : {})
  };
}

// ---------------------------------------------------------------- vues

const LIST_SELECT = {
  id: true,
  kind: true,
  number: true,
  lotId: true,
  contactId: true,
  chargeCallId: true,
  chargePaymentId: true,
  periodLabel: true,
  periodStart: true,
  periodEnd: true,
  amount: true,
  currency: true,
  issuedAt: true,
  emailedAt: true,
  emailError: true,
  snapshot: true
} as const;

type ListRow = {
  id: string;
  kind: string;
  number: string;
  lotId: string;
  contactId: string | null;
  chargeCallId: string | null;
  chargePaymentId: string | null;
  periodLabel: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  amount: Prisma.Decimal | number | string;
  currency: string;
  issuedAt: Date;
  emailedAt: Date | null;
  emailError: string | null;
  snapshot: unknown;
};

/** Vue d'un document pour une liste : aucun chemin de fichier, aucun snapshot brut. */
export function toReceiptView(row: ListRow) {
  const snapshot = snapshotOf(row);
  return {
    id: row.id,
    kind: row.kind,
    number: row.number,
    lotId: row.lotId,
    lotNumber: snapshot.lot?.number ?? null,
    contactId: row.contactId,
    coownerName: snapshot.coowner?.name ?? null,
    chargeCallId: row.chargeCallId,
    chargePaymentId: row.chargePaymentId,
    periodLabel: row.periodLabel,
    periodStart: isoDay(row.periodStart),
    periodEnd: isoDay(row.periodEnd),
    amount: fromCents(toCents(row.amount)),
    currency: row.currency,
    issuedAt: row.issuedAt,
    emailedAt: row.emailedAt,
    emailError: row.emailError,
    backfilled: Boolean(snapshot.backfilled)
  };
}

async function listPage(where: Prisma.SyndicChargeReceiptWhereInput, page: number, limit: number) {
  const [rows, total] = await Promise.all([
    prisma.syndicChargeReceipt.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ issuedAt: 'desc' }, { number: 'desc' }],
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.syndicChargeReceipt.count({ where })
  ]);
  return {
    items: (rows as ListRow[]).map(toReceiptView),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
  };
}

export async function listSyndicateReceipts(tenantId: string, syndicateId: string, query: ReceiptListQuery) {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  if (query.lotId) await assertLotOfSyndicate(prisma, tenantId, syndicateId, query.lotId);
  return listPage(listWhere(tenantId, syndicateId, query), query.page, query.limit);
}

export async function listLotReceipts(tenantId: string, syndicateId: string, lotId: string, query: ReceiptListQuery) {
  await assertLotOfSyndicate(prisma, tenantId, syndicateId, lotId);
  return listPage(listWhere(tenantId, syndicateId, { ...query, lotId }), query.page, query.limit);
}

// ---------------------------------------------------------------- un document

async function loadReceipt(tenantId: string, syndicateId: string, receiptId: string): Promise<StoredReceipt> {
  const receipt = await prisma.syndicChargeReceipt.findFirst({
    where: { id: receiptId, tenantId, syndicateId },
    select: STORED_RECEIPT_SELECT
  });
  if (!receipt) throw new NotFoundError(RECEIPT_NOT_FOUND);
  return receipt as StoredReceipt;
}

/** PDF d'un document (fichier stocké, ou reconstruit depuis le snapshot). */
export async function getReceiptFile(tenantId: string, syndicateId: string, receiptId: string) {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const receipt = await loadReceipt(tenantId, syndicateId, receiptId);
  return {
    buffer: await ensureReceiptPdf(receipt),
    fileName: receiptDownloadName(receipt),
    mimeType: 'application/pdf'
  };
}

/**
 * Renvoi manuel par e-mail. Geste explicite du gestionnaire : il passe même
 * si l'envoi AUTOMATIQUE est désactivé par l'agence (le modèle de l'agence
 * reste utilisé). 422 sans adresse, 502 si le serveur de messagerie refuse.
 */
export async function resendReceiptEmail(tenantId: string, syndicateId: string, receiptId: string) {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const receipt = await loadReceipt(tenantId, syndicateId, receiptId);
  const outcome = await sendReceiptEmail(receipt, undefined, { ignoreDisabled: true });
  if (outcome.sent) {
    const updated = await prisma.syndicChargeReceipt.findFirst({
      where: { id: receipt.id, tenantId },
      select: { emailedAt: true }
    });
    return { id: receipt.id, number: receipt.number, sent: true, emailedAt: updated?.emailedAt ?? new Date() };
  }
  if (outcome.reason === 'NO_EMAIL') {
    throw new ValidationError("Le copropriétaire de ce lot n'a pas d'adresse e-mail.");
  }
  throw new AppError("L'envoi de l'e-mail a échoué. Réessayez plus tard.", 502, 'EMAIL_SEND_FAILED');
}

// ---------------------------------------------------------------- impression groupée

/** Comparaison « naturelle » des numéros de lot (A-2 avant A-10). */
const lotCollator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

export async function printReceipts(tenantId: string, syndicateId: string, query: ReceiptPrintQuery): Promise<Buffer> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  if (query.lotId) await assertLotOfSyndicate(prisma, tenantId, syndicateId, query.lotId);

  const where = listWhere(tenantId, syndicateId, {
    lotId: query.lotId,
    contactId: query.contactId,
    kind: query.kind === 'ALL' ? undefined : query.kind,
    from: query.from,
    to: query.to
  });
  const total = await prisma.syndicChargeReceipt.count({ where });
  if (total === 0) {
    throw new ValidationError('Aucun document ne correspond à cette période et à ces filtres.');
  }
  if (total > MAX_DOCUMENTS_PER_PRINT) {
    throw new ValidationError(
      'Trop de documents pour une seule impression (500 au plus) : réduisez la période ou choisissez un copropriétaire.',
      [{ field: 'count', message: `${total} > ${MAX_DOCUMENTS_PER_PRINT}` }]
    );
  }

  const rows = (await prisma.syndicChargeReceipt.findMany({
    where,
    select: { id: true, snapshot: true, periodStart: true, issuedAt: true, number: true },
    orderBy: [{ issuedAt: 'asc' }, { number: 'asc' }],
    take: MAX_DOCUMENTS_PER_PRINT
  })) as Array<{ id: string; snapshot: unknown; periodStart: Date | null; issuedAt: Date; number: string }>;

  // Ordre : lot, puis date (début de période de l'appel, sinon émission).
  const dateOf = (row: (typeof rows)[number]) => (row.periodStart ?? row.issuedAt).getTime();
  rows.sort((a, b) => {
    const byLot = lotCollator.compare(snapshotOf(a).lot?.number ?? '', snapshotOf(b).lot?.number ?? '');
    if (byLot !== 0) return byLot;
    return dateOf(a) - dateOf(b) || a.number.localeCompare(b.number);
  });

  const context = await loadSyndicateRenderContext(tenantId, syndicateId);
  const items = rows.map(row => {
    const snapshot = snapshotOf(row);
    return { snapshot, branding: brandingForSnapshot(context, snapshot) };
  });
  return renderChargeReceiptSheets(items, query.cols, query.rows);
}

// ---------------------------------------------------------------- rattrapage

/**
 * « Générer les quittances manquantes » : une quittance pour chaque appel
 * PAID de la copropriété qui n'en a pas, snapshot construit avec les données
 * ACTUELLES et marqué `backfilled`. Aucun e-mail ; le PDF est produit à la
 * première demande. Idempotent : un second passage ne crée rien.
 */
export async function backfillMissingQuittances(tenantId: string, syndicateId: string, actorUserId: string | null) {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const paidCalls = await prisma.chargeCall.findMany({
    where: { syndicateId, status: 'PAID', syndicate: { tenantId } },
    select: { id: true, lotId: true }
  });
  const byLot = new Map<string, string[]>();
  for (const call of paidCalls) byLot.set(call.lotId, [...(byLot.get(call.lotId) ?? []), call.id]);

  let created = 0;
  for (const [lotId, callIds] of byLot) {
    const documents = await prisma.$transaction(async tx => {
      await lockLotTx(tx, lotId);
      return issueQuittancesForSettledCallsTx(tx, {
        tenantId,
        syndicateId,
        lotId,
        chargeCallIds: callIds,
        actorUserId,
        backfilled: true
      });
    });
    created += documents.length;
  }
  return { created, skipped: paidCalls.length - created };
}
