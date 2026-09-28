/**
 * Affectation des paiements de charges et avance du lot (lot S2).
 *
 * Invariants :
 * - le montant regle d'un appel est la somme de ses `ChargePaymentAllocation`
 *   (jamais `ChargePayment.chargeCallId`, garde pour compatibilite) ;
 * - `ChargePayment.unallocatedAmount` est la part du paiement non encore
 *   affectee : la somme sur le lot est son AVANCE ;
 * - le grand livre du lot recoit UN credit PAYMENT par paiement (montant
 *   total), au moment ou l'argent arrive. Imputer une avance n'est pas un
 *   mouvement d'argent : aucune ecriture de grand livre ;
 * - apres chaque paiement et chaque creation d'appel, un lot n'a jamais a la
 *   fois une avance et un appel ouvert (`applyLotAdvanceTx`) ;
 * - toute somme affectee a un appel (paiement ou avance imputee) credite, dans
 *   la meme transaction, les fonds de copropriete de cet appel
 *   (`fund-credits.ts`) ; l'avance non affectee ne credite aucun fonds ;
 * - toute ecriture sur l'affectation d'un lot se fait sous un verrou
 *   consultatif Postgres scope a ce lot (`lockLotTx`) : deux paiements ou une
 *   creation d'appel concurrente ne consomment jamais deux fois la meme avance.
 *
 * Les calculs sont dans `charge-allocation-plan.ts` (purs, testes a part).
 */

import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { NotFoundError, ValidationError } from '../../middleware/error-middleware';
import { appendOwnerAccountTransactionTx } from '../finance/ledger';
import { deriveChargeCallStatus, type ChargeCallStatusValue } from './finance-utils';
import { ensureOwnerAccountForLotTx } from './owner-account-tx';
import { formatIsoDay } from './period';
import { issueReceiptsForPaymentTx, toDocumentRefs, type IssuedChargeDocument } from './charge-receipts';
import { scheduleChargeDocumentDelivery } from './charge-receipt-delivery';
import { creditFundsForAllocationsTx } from './fund-credits';
import {
  fromCents,
  planAdvanceImputation,
  planAllocationCents,
  statusFromCents,
  toCents,
  type AdvanceSource,
  type AllocatableCall,
  type PlannedImputation
} from './charge-allocation-plan';

type Client = PrismaTransactionClient | typeof prisma;

/** Libelle du credit de grand livre (identique a l'historique et au rapprochement). */
export const CHARGE_PAYMENT_LEDGER_LABEL = 'Paiement appel de charges';

/** Etat d'un appel du lot, montants en centimes. */
export interface CallBalance extends AllocatableCall {
  period: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  amountCents: number;
  paidCents: number;
  currency: string;
  status: ChargeCallStatusValue;
}

export interface LotAllocationState {
  calls: CallBalance[];
  advances: AdvanceSource[];
}

export interface LotPaymentInput {
  tenantId: string;
  syndicateId: string;
  lotId: string;
  amount: number;
  paidAt: Date;
  method?: string | null;
  reference?: string | null;
  chargeCallIds?: string[] | null;
  actorUserId?: string | null;
}

export interface LotPaymentAllocationView {
  /** Paiement d'ou vient l'argent (`null` = le paiement en apercu). */
  paymentId: string | null;
  chargeCallId: string;
  period: string;
  amount: number;
  source: 'PAYMENT' | 'ADVANCE';
  callStatusAfter: ChargeCallStatusValue;
}

export interface LotPaymentResult {
  payment: {
    id: string | null;
    lotId: string;
    chargeCallId: string | null;
    amount: number;
    unallocatedAmount: number;
    paidAt: Date;
    method: string | null;
    reference: string | null;
  };
  allocations: LotPaymentAllocationView[];
  advance: number;
  lotAdvanceBalance: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Verrou et lecture de l'etat d'un lot
// ---------------------------------------------------------------------------

/**
 * Ordre global de prise des verrous de lot : identifiant croissant (ordre
 * lexicographique de l'UUID). Toute transaction qui verrouille PLUSIEURS lots
 * doit les parcourir dans cet ordre, sinon deux transactions concurrentes sur
 * les memes lots en ordre inverse s'interbloquent (Postgres 40P01).
 */
export function compareLotIdsForLocking(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortLotIdsForLocking(lotIds: string[]): string[] {
  return Array.from(new Set(lotIds)).sort(compareLotIdsForLocking);
}

/**
 * Verrou consultatif de transaction scope au lot (meme idiome que
 * `lib/finance/cash.ts`). Reentrant dans la meme transaction.
 */
export async function lockLotTx(tx: PrismaTransactionClient, lotId: string): Promise<void> {
  const key = `syndic-lot-allocation:${lotId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

async function loadCallBalances(client: Client, lotId: string): Promise<CallBalance[]> {
  const calls = await client.chargeCall.findMany({
    where: { lotId },
    select: {
      id: true,
      period: true,
      periodStart: true,
      periodEnd: true,
      dueDate: true,
      createdAt: true,
      amount: true,
      currency: true,
      status: true
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }]
  });
  const paidByCall = await sumAllocationsByCall(
    client,
    calls.map(call => call.id)
  );
  return calls.map(call => {
    const amountCents = toCents(call.amount);
    const paidCents = paidByCall.get(call.id) ?? 0;
    return {
      id: call.id,
      period: call.period,
      periodStart: call.periodStart ?? null,
      periodEnd: call.periodEnd ?? null,
      dueDate: call.dueDate,
      createdAt: call.createdAt,
      amountCents,
      paidCents,
      outstandingCents: Math.max(0, amountCents - paidCents),
      currency: call.currency,
      status: call.status as ChargeCallStatusValue
    };
  });
}

/** Regle de chaque appel (centimes), lu dans les affectations. */
export async function sumAllocationsByCall(client: Client, callIds: string[]): Promise<Map<string, number>> {
  const paid = new Map<string, number>();
  if (callIds.length === 0) return paid;
  const rows = await client.chargePaymentAllocation.findMany({
    where: { chargeCallId: { in: callIds } },
    select: { chargeCallId: true, amount: true }
  });
  for (const row of rows) {
    paid.set(row.chargeCallId, (paid.get(row.chargeCallId) ?? 0) + toCents(row.amount));
  }
  return paid;
}

async function loadAdvances(client: Client, lotId: string): Promise<AdvanceSource[]> {
  const payments = await client.chargePayment.findMany({
    where: { lotId, unallocatedAmount: { gt: 0 } },
    select: { id: true, paidAt: true, createdAt: true, unallocatedAmount: true },
    orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }]
  });
  return payments
    .map(payment => ({
      paymentId: payment.id,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      availableCents: toCents(payment.unallocatedAmount)
    }))
    .filter(advance => advance.availableCents > 0);
}

export async function loadLotAllocationState(client: Client, lotId: string): Promise<LotAllocationState> {
  const [calls, advances] = await Promise.all([loadCallBalances(client, lotId), loadAdvances(client, lotId)]);
  return { calls, advances };
}

/** Avance du lot (somme des parts non affectees), en centimes. */
export async function lotAdvanceCents(client: Client, lotId: string): Promise<number> {
  const advances = await loadAdvances(client, lotId);
  return advances.reduce((sum, advance) => sum + advance.availableCents, 0);
}

// ---------------------------------------------------------------------------
// Ecritures
// ---------------------------------------------------------------------------

/** Ajoute un montant au regle d'un appel (etat en memoire) et recalcule son reste du. */
function creditCall(callById: Map<string, CallBalance>, chargeCallId: string, cents: number) {
  const call = callById.get(chargeCallId);
  if (!call) return;
  call.paidCents += cents;
  call.outstandingCents = Math.max(0, call.amountCents - call.paidCents);
}

/** Ecrit le statut stocke des appels dont le regle a change. */
async function writeCallStatusesTx(tx: PrismaTransactionClient, calls: CallBalance[], touched: Set<string>) {
  for (const call of calls) {
    if (!touched.has(call.id)) continue;
    const status = statusFromCents(call.paidCents, call.amountCents);
    if (status !== call.status) {
      await tx.chargeCall.update({ where: { id: call.id }, data: { status } });
      call.status = status;
    }
  }
}

/** Ajoute une imputation d'avance ; cumule si le couple paiement/appel existe deja. */
async function writeImputationTx(tx: PrismaTransactionClient, imputation: PlannedImputation) {
  const existing = await tx.chargePaymentAllocation.findFirst({
    where: { paymentId: imputation.paymentId, chargeCallId: imputation.chargeCallId },
    select: { id: true, amount: true }
  });
  if (existing) {
    await tx.chargePaymentAllocation.update({
      where: { id: existing.id },
      data: { amount: fromCents(toCents(existing.amount) + imputation.amountCents) }
    });
    return;
  }
  await tx.chargePaymentAllocation.create({
    data: {
      paymentId: imputation.paymentId,
      chargeCallId: imputation.chargeCallId,
      amount: fromCents(imputation.amountCents),
      source: 'ADVANCE'
    }
  });
}

export interface AdvanceApplication {
  imputations: PlannedImputation[];
  calls: CallBalance[];
}

/**
 * Impute les avances du lot sur ses appels ouverts (echeance croissante),
 * en consommant les paiements dans l'ordre (FIFO). Aucun mouvement de grand
 * livre : l'argent a deja ete credite a l'arrivee du paiement.
 *
 * A appeler apres toute creation d'appel(s) pour le lot, AVANT de notifier
 * ces appels (un appel entierement couvert n'est pas notifie).
 */
export async function applyLotAdvanceTx(tx: PrismaTransactionClient, lotId: string): Promise<AdvanceApplication> {
  await lockLotTx(tx, lotId);
  const advances = await loadAdvances(tx, lotId);
  if (advances.length === 0) {
    return { imputations: [], calls: [] };
  }

  const calls = await loadCallBalances(tx, lotId);
  const imputations = planAdvanceImputation(advances, calls);
  if (imputations.length === 0) {
    return { imputations, calls };
  }

  const usedByPayment = new Map<string, number>();
  const touched = new Set<string>();
  const callById = new Map(calls.map(call => [call.id, call]));
  for (const imputation of imputations) {
    await writeImputationTx(tx, imputation);
    usedByPayment.set(imputation.paymentId, (usedByPayment.get(imputation.paymentId) ?? 0) + imputation.amountCents);
    creditCall(callById, imputation.chargeCallId, imputation.amountCents);
    touched.add(imputation.chargeCallId);
  }

  for (const advance of advances) {
    const used = usedByPayment.get(advance.paymentId);
    if (!used) continue;
    await tx.chargePayment.update({
      where: { id: advance.paymentId },
      data: { unallocatedAmount: fromCents(advance.availableCents - used) }
    });
  }

  await writeCallStatusesTx(tx, calls, touched);
  await creditFundsForAllocationsTx(tx, {
    lotId,
    items: imputations.map(item => ({ ...item, source: 'ADVANCE' as const }))
  });
  return { imputations, calls };
}

function assertPositiveAmount(amountCents: number) {
  if (amountCents <= 0) {
    throw new ValidationError('Le montant du paiement doit etre strictement positif.', [
      { field: 'amount', message: 'Montant strictement positif attendu.' }
    ]);
  }
}

/** Les appels designes doivent tous appartenir au lot (sinon 404, comme un appel inexistant). */
function assertSelectedCallsOfLot(calls: CallBalance[], selected?: string[] | null) {
  if (!selected || selected.length === 0) return;
  const ids = new Set(calls.map(call => call.id));
  if (selected.some(id => !ids.has(id))) {
    throw new NotFoundError('Appel de charges introuvable pour ce lot.');
  }
}

async function creditLedgerTx(
  tx: PrismaTransactionClient,
  input: LotPaymentInput,
  paymentId: string,
  amountCents: number
) {
  const account = await ensureOwnerAccountForLotTx(tx, input.tenantId, input.syndicateId, input.lotId);
  if (!account) return;
  await appendOwnerAccountTransactionTx(tx, {
    accountId: account.id,
    type: 'PAYMENT',
    credit: fromCents(amountCents),
    label: CHARGE_PAYMENT_LEDGER_LABEL,
    reference: input.reference ?? null,
    sourceId: paymentId,
    transactionDate: input.paidAt
  });
}

/**
 * Enregistre un paiement du lot : affectation (appels designes ou plus anciens
 * d'abord), avance du reliquat, un seul credit de grand livre, puis imputation
 * des avances sur les appels encore ouverts. Le lot et les appels designes
 * doivent avoir ete verifies comme appartenant a l'agence par l'appelant.
 */
export async function recordLotPaymentTx(tx: PrismaTransactionClient, input: LotPaymentInput) {
  const amountCents = toCents(input.amount);
  assertPositiveAmount(amountCents);
  await lockLotTx(tx, input.lotId);

  const calls = await loadCallBalances(tx, input.lotId);
  assertSelectedCallsOfLot(calls, input.chargeCallIds);
  const plan = planAllocationCents(calls, amountCents, input.chargeCallIds);

  const payment = await tx.chargePayment.create({
    data: {
      lotId: input.lotId,
      chargeCallId: plan.allocations[0]?.chargeCallId ?? null,
      amount: fromCents(amountCents),
      unallocatedAmount: fromCents(plan.advanceCents),
      paidAt: input.paidAt,
      method: input.method ?? null,
      reference: input.reference ?? null,
      createdById: input.actorUserId ?? null
    }
  });

  const touched = new Set<string>();
  const callById = new Map(calls.map(call => [call.id, call]));
  for (const allocation of plan.allocations) {
    await tx.chargePaymentAllocation.create({
      data: {
        paymentId: payment.id,
        chargeCallId: allocation.chargeCallId,
        amount: fromCents(allocation.amountCents),
        source: 'PAYMENT'
      }
    });
    creditCall(callById, allocation.chargeCallId, allocation.amountCents);
    touched.add(allocation.chargeCallId);
  }
  await writeCallStatusesTx(tx, calls, touched);
  await creditLedgerTx(tx, input, payment.id, amountCents);
  await creditFundsForAllocationsTx(tx, {
    lotId: input.lotId,
    actorUserId: input.actorUserId ?? null,
    items: plan.allocations.map(item => ({
      paymentId: payment.id,
      chargeCallId: item.chargeCallId,
      amountCents: item.amountCents,
      source: 'PAYMENT' as const
    }))
  });

  const application = await applyLotAdvanceTx(tx, input.lotId);
  const finalCalls = application.calls.length > 0 ? application.calls : calls;
  const unallocatedCents = remainingAdvanceOf(payment.id, plan.advanceCents, application.imputations);

  return {
    // Ligne du paiement, avec l'avance restante APRES imputation (la valeur
    // ecrite a la creation a pu etre consommee par applyLotAdvanceTx).
    record: { ...payment, unallocatedAmount: new Decimal(fromCents(unallocatedCents)) },
    result: buildResult({
      input,
      paymentId: payment.id,
      amountCents,
      paymentAllocations: plan.allocations.map(item => ({ ...item, paymentId: payment.id })),
      imputations: application.imputations,
      calls: finalCalls,
      unallocatedCents,
      lotAdvanceCents: await lotAdvanceCents(tx, input.lotId)
    })
  };
}

/** Avance restante d'un paiement apres les imputations qui l'ont consommee. */
function remainingAdvanceOf(paymentId: string, initialCents: number, imputations: PlannedImputation[]): number {
  const used = imputations
    .filter(item => item.paymentId === paymentId)
    .reduce((sum, item) => sum + item.amountCents, 0);
  return Math.max(0, initialCents - used);
}

/**
 * Apercu d'un paiement, sans aucune ecriture : meme calcul que
 * `recordLotPaymentTx`, y compris l'imputation qui suivrait.
 */
export async function previewLotPayment(client: Client, input: LotPaymentInput): Promise<LotPaymentResult> {
  const amountCents = toCents(input.amount);
  assertPositiveAmount(amountCents);
  const state = await loadLotAllocationState(client, input.lotId);
  assertSelectedCallsOfLot(state.calls, input.chargeCallIds);

  const plan = planAllocationCents(state.calls, amountCents, input.chargeCallIds);
  const calls = state.calls.map(call => ({ ...call }));
  const callById = new Map(calls.map(call => [call.id, call]));
  for (const allocation of plan.allocations) {
    creditCall(callById, allocation.chargeCallId, allocation.amountCents);
  }

  const PREVIEW_ID = '__apercu__';
  const advances: AdvanceSource[] = [
    ...state.advances,
    { paymentId: PREVIEW_ID, paidAt: input.paidAt, createdAt: new Date(), availableCents: plan.advanceCents }
  ];
  const imputations = planAdvanceImputation(advances, calls);
  for (const imputation of imputations) {
    creditCall(callById, imputation.chargeCallId, imputation.amountCents);
  }

  const totalAdvanceBefore = state.advances.reduce((sum, advance) => sum + advance.availableCents, 0);
  const totalImputed = imputations.reduce((sum, item) => sum + item.amountCents, 0);

  const result = buildResult({
    input,
    paymentId: PREVIEW_ID,
    amountCents,
    paymentAllocations: plan.allocations.map(item => ({ ...item, paymentId: PREVIEW_ID })),
    imputations,
    calls,
    unallocatedCents: remainingAdvanceOf(PREVIEW_ID, plan.advanceCents, imputations),
    lotAdvanceCents: totalAdvanceBefore + plan.advanceCents - totalImputed
  });
  return {
    ...result,
    payment: { ...result.payment, id: null },
    allocations: result.allocations.map(item => ({
      ...item,
      paymentId: item.paymentId === PREVIEW_ID ? null : item.paymentId
    }))
  };
}

function buildResult(args: {
  input: LotPaymentInput;
  paymentId: string;
  amountCents: number;
  paymentAllocations: PlannedImputation[];
  imputations: PlannedImputation[];
  calls: CallBalance[];
  unallocatedCents: number;
  lotAdvanceCents: number;
}): LotPaymentResult {
  const now = new Date();
  const callById = new Map(args.calls.map(call => [call.id, call]));
  const view = (item: PlannedImputation, source: 'PAYMENT' | 'ADVANCE'): LotPaymentAllocationView => {
    const call = callById.get(item.chargeCallId);
    const stored = call ? statusFromCents(call.paidCents, call.amountCents) : 'PENDING';
    return {
      paymentId: item.paymentId,
      chargeCallId: item.chargeCallId,
      period: call?.period ?? '',
      amount: fromCents(item.amountCents),
      source,
      callStatusAfter: call ? deriveChargeCallStatus(stored, call.dueDate, now) : stored
    };
  };

  return {
    payment: {
      id: args.paymentId,
      lotId: args.input.lotId,
      chargeCallId: args.paymentAllocations[0]?.chargeCallId ?? null,
      amount: fromCents(args.amountCents),
      unallocatedAmount: fromCents(args.unallocatedCents),
      paidAt: args.input.paidAt,
      method: args.input.method ?? null,
      reference: args.input.reference ?? null
    },
    allocations: [
      ...args.paymentAllocations.map(item => view(item, 'PAYMENT')),
      ...args.imputations.map(item => view(item, 'ADVANCE'))
    ],
    advance: fromCents(args.unallocatedCents),
    lotAdvanceBalance: fromCents(args.lotAdvanceCents),
    currency: args.calls[0]?.currency ?? 'XOF'
  };
}

// ---------------------------------------------------------------------------
// Points d'entree (verification d'appartenance puis transaction)
// ---------------------------------------------------------------------------

/** La copropriete doit appartenir a l'agence ; sinon 404 (comme une copropriete inexistante). */
export async function assertSyndicateOfTenant(client: Client, tenantId: string, syndicateId: string) {
  const syndicate = await client.syndicate.findFirst({ where: { id: syndicateId, tenantId }, select: { id: true } });
  if (!syndicate) {
    throw new NotFoundError('Copropriete introuvable ou inaccessible.');
  }
}

/** Le lot doit appartenir a la copropriete de l'agence ; sinon 404. */
export async function assertLotOfSyndicate(client: Client, tenantId: string, syndicateId: string, lotId: string) {
  const lot = await client.syndicateLot.findFirst({
    where: { id: lotId, syndicateId, syndicate: { tenantId } },
    select: { id: true }
  });
  if (!lot) {
    throw new NotFoundError('Lot introuvable ou inaccessible pour cette copropriete.');
  }
}

/** Reponse d'un paiement enregistre : le resultat S2, plus les documents emis (lot S3). */
export type RecordedLotPayment = LotPaymentResult & {
  documents: Array<Pick<IssuedChargeDocument, 'id' | 'kind' | 'number'>>;
};

export async function recordLotPayment(input: LotPaymentInput): Promise<RecordedLotPayment> {
  await assertLotOfSyndicate(prisma, input.tenantId, input.syndicateId, input.lotId);
  const { result, documents } = await prisma.$transaction(async tx => {
    const recorded = await recordLotPaymentTx(tx, input);
    // Lot S3 : recu et quittances, numerotes dans la transaction du paiement.
    const issued = await issueReceiptsForPaymentTx(tx, {
      tenantId: input.tenantId,
      syndicateId: input.syndicateId,
      lotId: input.lotId,
      paymentId: recorded.record.id,
      result: recorded.result,
      actorUserId: input.actorUserId ?? null
    });
    return { result: recorded.result, documents: issued };
  });
  // PDF et e-mail apres le commit : leur echec n'annule jamais le paiement.
  scheduleChargeDocumentDelivery(input.tenantId, documents);
  return { ...result, documents: toDocumentRefs(documents) };
}

export async function previewLotPaymentForTenant(input: LotPaymentInput): Promise<LotPaymentResult> {
  await assertLotOfSyndicate(prisma, input.tenantId, input.syndicateId, input.lotId);
  return previewLotPayment(prisma, input);
}

export async function getLotAdvance(tenantId: string, syndicateId: string, lotId: string) {
  await assertLotOfSyndicate(prisma, tenantId, syndicateId, lotId);
  const [cents, anyCall] = await Promise.all([
    lotAdvanceCents(prisma, lotId),
    prisma.chargeCall.findFirst({ where: { lotId }, select: { currency: true } })
  ]);
  return { advance: fromCents(cents), currency: anyCall?.currency ?? 'XOF' };
}

/** Appels non soldes du lot, pour la selection des mois couverts. */
export async function listOpenCallsForLot(tenantId: string, syndicateId: string, lotId: string) {
  await assertLotOfSyndicate(prisma, tenantId, syndicateId, lotId);
  const now = new Date();
  const calls = await loadCallBalances(prisma, lotId);
  return calls
    .filter(call => call.outstandingCents > 0)
    .map(call => ({
      id: call.id,
      period: call.period,
      periodStart: formatIsoDay(call.periodStart),
      periodEnd: formatIsoDay(call.periodEnd),
      dueDate: call.dueDate,
      amount: fromCents(call.amountCents),
      paid: fromCents(call.paidCents),
      outstanding: fromCents(call.outstandingCents),
      currency: call.currency,
      status: deriveChargeCallStatus(statusFromCents(call.paidCents, call.amountCents), call.dueDate, now)
    }));
}

/** Regle d'un appel, en unites, a partir d'affectations deja chargees. */
export function paidFromAllocations(allocations: Array<{ amount: Prisma.Decimal | number | string }> | undefined) {
  const cents = (allocations ?? []).reduce((sum, allocation) => sum + toCents(allocation.amount), 0);
  return fromCents(cents);
}

// ---------------------------------------------------------------------------
// Lecture d'un appel avec ses paiements (compatibilite des reponses existantes)
// ---------------------------------------------------------------------------

/**
 * `include` Prisma des affectations d'un appel, avec le paiement d'origine.
 * Remplace l'ancien `include: { payments: true }`.
 */
export const CHARGE_CALL_ALLOCATIONS_INCLUDE = {
  allocations: {
    select: {
      id: true,
      paymentId: true,
      amount: true,
      source: true,
      createdAt: true,
      payment: { select: { paidAt: true, method: true, reference: true, createdAt: true } }
    },
    orderBy: { createdAt: 'asc' }
  }
} satisfies Prisma.ChargeCallInclude;

type CallWithAllocations = {
  id: string;
  amount: Prisma.Decimal | number | string;
  allocations: Array<{
    id: string;
    paymentId: string;
    amount: Prisma.Decimal | number | string;
    source: string;
    createdAt: Date;
    payment: { paidAt: Date; method: string | null; reference: string | null; createdAt: Date };
  }>;
};

/**
 * Forme de reponse historique d'un appel : `payments` est reconstitue a partir
 * des affectations, une ligne par affectation (le montant est la part de CE
 * paiement affectee a CET appel). `id` est celui de l'affectation — egal a
 * l'identifiant du paiement pour les paiements anterieurs au lot S2 —,
 * `paymentId` celui du paiement. Ajouts : `paidAmount`, `outstandingAmount`.
 */
export function withAllocationPayments<T extends CallWithAllocations>(call: T) {
  const { allocations, ...rest } = call;
  const paidCents = allocations.reduce((sum, allocation) => sum + toCents(allocation.amount), 0);
  return {
    ...rest,
    payments: allocations.map(allocation => ({
      id: allocation.id,
      paymentId: allocation.paymentId,
      chargeCallId: call.id,
      amount: allocation.amount,
      source: allocation.source,
      paidAt: allocation.payment.paidAt,
      method: allocation.payment.method,
      reference: allocation.payment.reference,
      createdAt: allocation.payment.createdAt
    })),
    paidAmount: fromCents(paidCents),
    outstandingAmount: fromCents(Math.max(0, toCents(call.amount) - paidCents))
  };
}
