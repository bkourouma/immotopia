import type { Prisma } from '@prisma/client';
import type { PrismaTransactionClient } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import {
  issuerFromMandant,
  issuerFromTenant,
  MANDANT_IDENTITY_SELECT,
  TENANT_IDENTITY_SELECT
} from '../documents/document-branding';
import { fromCents, toCents } from './charge-allocation-plan';
import type { LotPaymentResult } from './charge-allocation';
import { AGENCY_ISSUER_KEY, nextChargeReceiptNumberTx, type ChargeReceiptKind } from './charge-receipt-numbering';
import {
  CHARGE_RECEIPT_SNAPSHOT_VERSION,
  contactDisplayName,
  isoDay,
  lotTypeLabel,
  type ChargeReceiptSnapshot,
  type SnapshotAllocation,
  type SnapshotIssuer,
  type SnapshotIssuerImages,
  type SnapshotPeriod
} from './charge-receipt-snapshot';

/**
 * Émission des reçus de paiement et des quittances de charges (lot S3, P5).
 *
 * Règles :
 * - chaque appel ENTIÈREMENT soldé — par un paiement, ou plus tard par
 *   l'imputation d'une avance — reçoit UNE quittance de sa période (index
 *   unique partiel en base, et vérification ici sous le verrou du lot) ;
 * - un paiement reçoit un REÇU s'il laisse un reste dû sur au moins un des
 *   appels qu'il touche, ou s'il reste (en tout ou partie) en avance. Un
 *   paiement qui solde exactement ses appels n'a que leurs quittances.
 *
 * Tout se passe DANS la transaction du paiement (ou de la création d'appel) :
 * numéro réservé, enregistrement créé avec son `snapshot`. Le PDF et l'e-mail
 * viennent après le commit (`charge-receipt-delivery.ts`) : leur échec
 * n'annule jamais le paiement.
 */

/** Document émis, tel que renvoyé aux appelants (et dans les réponses de paiement). */
export interface IssuedChargeDocument {
  id: string;
  kind: ChargeReceiptKind;
  number: string;
}

/** Vue publique d'un document émis dans une réponse de paiement. */
export function toDocumentRefs(documents: IssuedChargeDocument[]) {
  return documents.map(({ id, kind, number }) => ({ id, kind, number }));
}

// ---------------------------------------------------------------------------
// Règles pures
// ---------------------------------------------------------------------------

/**
 * Un paiement donne-t-il un reçu ? Oui s'il reste un dû sur un appel qu'il
 * touche, s'il reste en avance, ou s'il n'a touché aucun appel (avance pure).
 */
export function shouldIssueReceipt(touchedOutstandingCents: number[], remainingAdvanceCents: number): boolean {
  if (touchedOutstandingCents.length === 0) return true;
  if (remainingAdvanceCents > 0) return true;
  return touchedOutstandingCents.some(cents => cents > 0);
}

/** Appels soldés (montant positif, rien à payer), parmi ceux donnés. */
export function settledCallIds(calls: Array<{ id: string; amountCents: number; paidCents: number }>): string[] {
  return calls.filter(call => call.amountCents > 0 && call.paidCents >= call.amountCents).map(call => call.id);
}

// ---------------------------------------------------------------------------
// Contexte d'émission (émetteur, copropriété, lot, copropriétaire)
// ---------------------------------------------------------------------------

interface IssuanceContext {
  tenantId: string;
  syndicateId: string;
  lotId: string;
  issuerKey: string;
  contactId: string | null;
  base: Pick<ChargeReceiptSnapshot, 'issuer' | 'issuerImages' | 'syndicate' | 'lot' | 'coowner'>;
}

const CONTACT_SELECT = { id: true, firstName: true, lastName: true, legalName: true, address: true } as const;

/**
 * Lit, dans la transaction, l'identité à figer. La copropriété doit être de
 * l'agence et le lot de la copropriété (sinon 404, comme un objet inexistant).
 */
async function loadIssuanceContextTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  syndicateId: string,
  lotId: string
): Promise<IssuanceContext> {
  const syndicate = await tx.syndicate.findFirst({
    where: { id: syndicateId, tenantId },
    select: {
      name: true,
      address: true,
      registrationNo: true,
      cadastralReference: true,
      mandatingAgencyId: true,
      mandatingAgency: {
        select: { ...MANDANT_IDENTITY_SELECT, logoPath: true, signaturePath: true, stampPath: true }
      }
    }
  });
  if (!syndicate) throw new NotFoundError('Copropriete introuvable ou inaccessible.');

  const lot = await tx.syndicateLot.findFirst({
    where: { id: lotId, syndicateId },
    select: {
      lotNumber: true,
      lotType: true,
      owner: { select: CONTACT_SELECT },
      coowner: { select: CONTACT_SELECT },
      property: { select: { title: true } }
    }
  });
  if (!lot) throw new NotFoundError('Lot introuvable ou inaccessible pour cette copropriete.');

  // Émetteur et clés de ses images, figés ensemble (même lecture).
  let issuer: SnapshotIssuer;
  let issuerImages: SnapshotIssuerImages;
  const mandant = syndicate.mandatingAgency;
  if (syndicate.mandatingAgencyId && mandant) {
    issuer = { ...issuerFromMandant(mandant), key: syndicate.mandatingAgencyId };
    issuerImages = {
      logo: mandant.logoPath ?? null,
      signature: mandant.signaturePath ?? null,
      stamp: mandant.stampPath ?? null
    };
  } else {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { ...TENANT_IDENTITY_SELECT, logoUrl: true, documentSignaturePath: true, documentStampPath: true }
    });
    issuer = { ...issuerFromTenant(tenant), key: AGENCY_ISSUER_KEY };
    issuerImages = {
      logo: tenant?.logoUrl ?? null,
      signature: tenant?.documentSignaturePath ?? null,
      stamp: tenant?.documentStampPath ?? null
    };
  }

  const contact = lot.owner ?? lot.coowner ?? null;
  const trim = (value: string | null | undefined) => value?.trim() || null;
  return {
    tenantId,
    syndicateId,
    lotId,
    issuerKey: issuer.key,
    contactId: contact?.id ?? null,
    base: {
      issuer,
      issuerImages,
      syndicate: {
        name: syndicate.name,
        address: trim(syndicate.address),
        registrationNo: trim(syndicate.registrationNo),
        cadastralReference: trim(syndicate.cadastralReference)
      },
      lot: { number: lot.lotNumber, type: lotTypeLabel(lot.lotType), label: trim(lot.property?.title) },
      coowner: contact
        ? { name: contactDisplayName(contact) ?? 'Copropriétaire', address: trim(contact.address) }
        : null
    }
  };
}

function emptySnapshotParts() {
  return {
    call: null,
    settlements: [],
    settledAt: null,
    payment: null,
    allocations: [],
    outstandingAfter: 0,
    advance: 0,
    lotAdvanceBalance: 0,
    backfilled: false
  } satisfies Partial<ChargeReceiptSnapshot>;
}

async function createDocumentTx(
  tx: PrismaTransactionClient,
  context: IssuanceContext,
  args: {
    kind: ChargeReceiptKind;
    issuedAt: Date;
    amount: number;
    currency: string;
    chargePaymentId?: string | null;
    chargeCallId?: string | null;
    period?: { label: string | null; start: Date | null; end: Date | null } | null;
    actorUserId?: string | null;
    build: (number: string) => ChargeReceiptSnapshot;
  }
): Promise<IssuedChargeDocument> {
  const number = await nextChargeReceiptNumberTx(tx, {
    tenantId: context.tenantId,
    issuerKey: context.issuerKey,
    kind: args.kind,
    issuedAt: args.issuedAt
  });
  const snapshot = args.build(number);
  const created = await tx.syndicChargeReceipt.create({
    data: {
      tenantId: context.tenantId,
      syndicateId: context.syndicateId,
      lotId: context.lotId,
      contactId: context.contactId,
      kind: args.kind,
      number,
      issuerKey: context.issuerKey,
      chargePaymentId: args.chargePaymentId ?? null,
      chargeCallId: args.chargeCallId ?? null,
      periodStart: args.period?.start ?? null,
      periodEnd: args.period?.end ?? null,
      periodLabel: args.period?.label ?? null,
      amount: args.amount,
      currency: args.currency,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      issuedAt: args.issuedAt,
      createdById: args.actorUserId ?? null
    },
    select: { id: true, kind: true, number: true }
  });
  return { id: created.id, kind: created.kind as ChargeReceiptKind, number: created.number };
}

// ---------------------------------------------------------------------------
// Quittances
// ---------------------------------------------------------------------------

interface CallForQuittance {
  id: string;
  period: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  amount: Prisma.Decimal | number | string;
  currency: string;
  dueDate: Date;
  allocations: Array<{
    amount: Prisma.Decimal | number | string;
    source: string;
    createdAt: Date;
    payment: { paidAt: Date; method: string | null; reference: string | null };
  }>;
}

/**
 * Appels du lot avec leurs règlements. Affectations et paiements sont lus à
 * part (pas par relation imbriquée) : deux requêtes simples, indexées.
 */
async function loadCallsForQuittanceTx(
  tx: PrismaTransactionClient,
  lotId: string,
  callIds: string[]
): Promise<CallForQuittance[]> {
  if (callIds.length === 0) return [];
  const calls = await tx.chargeCall.findMany({
    where: { id: { in: callIds }, lotId },
    select: {
      id: true,
      period: true,
      periodStart: true,
      periodEnd: true,
      amount: true,
      currency: true,
      dueDate: true
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }]
  });
  const allocations = await tx.chargePaymentAllocation.findMany({
    where: { chargeCallId: { in: calls.map(call => call.id) } },
    select: { chargeCallId: true, paymentId: true, amount: true, source: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  });
  const payments = await tx.chargePayment.findMany({
    where: { id: { in: Array.from(new Set(allocations.map(allocation => allocation.paymentId))) } },
    select: { id: true, paidAt: true, method: true, reference: true }
  });
  const paymentById = new Map(payments.map(payment => [payment.id, payment]));
  return calls.map(call => ({
    ...call,
    periodStart: call.periodStart ?? null,
    periodEnd: call.periodEnd ?? null,
    allocations: allocations
      .filter(allocation => allocation.chargeCallId === call.id)
      .map(allocation => {
        const payment = paymentById.get(allocation.paymentId);
        return {
          amount: allocation.amount,
          source: allocation.source,
          createdAt: allocation.createdAt,
          payment: {
            paidAt: payment?.paidAt ?? allocation.createdAt,
            method: payment?.method ?? null,
            reference: payment?.reference ?? null
          }
        };
      })
  }));
}

function callPeriod(call: Pick<CallForQuittance, 'period' | 'periodStart' | 'periodEnd'>): SnapshotPeriod {
  return { label: call.period || null, start: isoDay(call.periodStart), end: isoDay(call.periodEnd) };
}

function quittanceSnapshot(
  context: IssuanceContext,
  call: CallForQuittance,
  number: string,
  issuedAt: Date,
  backfilled: boolean
): ChargeReceiptSnapshot {
  const settlements = [...call.allocations]
    .sort((a, b) => a.payment.paidAt.getTime() - b.payment.paidAt.getTime())
    .map(allocation => ({
      paidAt: allocation.payment.paidAt.toISOString(),
      // Rattrapage : le payeur n'est pas connu avec certitude, ni mode ni référence.
      method: backfilled ? null : allocation.payment.method,
      reference: backfilled ? null : allocation.payment.reference,
      amount: fromCents(toCents(allocation.amount)),
      source: (allocation.source === 'ADVANCE' ? 'ADVANCE' : 'PAYMENT') as 'PAYMENT' | 'ADVANCE'
    }));
  const amount = fromCents(toCents(call.amount));
  return {
    ...emptySnapshotParts(),
    version: CHARGE_RECEIPT_SNAPSHOT_VERSION,
    kind: 'QUITTANCE',
    number,
    issuedAt: issuedAt.toISOString(),
    currency: call.currency,
    amount,
    ...context.base,
    call: { id: call.id, period: callPeriod(call), amount, dueDate: call.dueDate.toISOString() },
    settlements,
    settledAt: settlements.length ? settlements[settlements.length - 1].paidAt : null,
    backfilled
  };
}

export interface QuittanceIssueInput {
  tenantId: string;
  syndicateId: string;
  lotId: string;
  chargeCallIds: string[];
  actorUserId?: string | null;
  issuedAt?: Date;
  /** Rattrapage : snapshot reconstitué avec les données actuelles. */
  backfilled?: boolean;
}

/**
 * Émet une quittance pour chaque appel donné qui est entièrement soldé et
 * n'en a pas encore. À appeler dans la transaction qui a soldé les appels,
 * sous le verrou du lot (déjà pris par `recordLotPaymentTx` ou
 * `applyLotAdvanceTx`). Renvoie les quittances émises.
 */
export async function issueQuittancesForSettledCallsTx(
  tx: PrismaTransactionClient,
  input: QuittanceIssueInput,
  preloadedContext?: IssuanceContext
): Promise<IssuedChargeDocument[]> {
  const ids = Array.from(new Set(input.chargeCallIds));
  if (ids.length === 0) return [];

  const calls = await loadCallsForQuittanceTx(tx, input.lotId, ids);
  const settled = new Set(
    settledCallIds(
      calls.map(call => ({
        id: call.id,
        amountCents: toCents(call.amount),
        paidCents: call.allocations.reduce((sum, allocation) => sum + toCents(allocation.amount), 0)
      }))
    )
  );
  if (settled.size === 0) return [];

  const existing = await tx.syndicChargeReceipt.findMany({
    where: { tenantId: input.tenantId, kind: 'QUITTANCE', chargeCallId: { in: Array.from(settled) } },
    select: { chargeCallId: true }
  });
  const alreadyIssued = new Set(existing.map(row => row.chargeCallId));
  const toIssue = calls.filter(call => settled.has(call.id) && !alreadyIssued.has(call.id));
  if (toIssue.length === 0) return [];

  const context = preloadedContext ?? (await loadIssuanceContextTx(tx, input.tenantId, input.syndicateId, input.lotId));
  const issuedAt = input.issuedAt ?? new Date();
  const documents: IssuedChargeDocument[] = [];
  for (const call of toIssue) {
    documents.push(
      await createDocumentTx(tx, context, {
        kind: 'QUITTANCE',
        issuedAt,
        amount: fromCents(toCents(call.amount)),
        currency: call.currency,
        chargeCallId: call.id,
        period: { label: call.period || null, start: call.periodStart, end: call.periodEnd },
        actorUserId: input.actorUserId,
        build: number => quittanceSnapshot(context, call, number, issuedAt, Boolean(input.backfilled))
      })
    );
  }
  return documents;
}

// ---------------------------------------------------------------------------
// Reçus de paiement
// ---------------------------------------------------------------------------

export interface PaymentReceiptInput {
  tenantId: string;
  syndicateId: string;
  lotId: string;
  paymentId: string;
  /** Résultat de `recordLotPaymentTx` (affectations, avance restante). */
  result: LotPaymentResult;
  actorUserId?: string | null;
  issuedAt?: Date;
}

/** Montant affecté par CE paiement à chaque appel (paiement + son avance imputée). */
function ownAllocationsByCall(result: LotPaymentResult, paymentId: string) {
  const byCall = new Map<string, { cents: number; source: 'PAYMENT' | 'ADVANCE' }>();
  for (const allocation of result.allocations) {
    if (allocation.paymentId !== paymentId) continue;
    const current = byCall.get(allocation.chargeCallId);
    byCall.set(allocation.chargeCallId, {
      cents: (current?.cents ?? 0) + toCents(allocation.amount),
      source: current?.source ?? allocation.source
    });
  }
  return byCall;
}

/**
 * Après `recordLotPaymentTx`, dans la même transaction : quittance de chaque
 * appel que ce paiement (ou une avance imputée dans la foulée) a soldé, puis
 * reçu du paiement si la règle P5 le demande. Renvoie les documents émis.
 */
export async function issueReceiptsForPaymentTx(
  tx: PrismaTransactionClient,
  input: PaymentReceiptInput
): Promise<IssuedChargeDocument[]> {
  const issuedAt = input.issuedAt ?? new Date();
  const context = await loadIssuanceContextTx(tx, input.tenantId, input.syndicateId, input.lotId);
  const touchedIds = Array.from(new Set(input.result.allocations.map(allocation => allocation.chargeCallId)));

  const quittances = await issueQuittancesForSettledCallsTx(
    tx,
    { ...input, chargeCallIds: touchedIds, issuedAt },
    context
  );

  const own = ownAllocationsByCall(input.result, input.paymentId);
  const ownCalls = await loadCallsForQuittanceTx(tx, input.lotId, Array.from(own.keys()));
  const allocations: SnapshotAllocation[] = ownCalls.map(call => {
    const callCents = toCents(call.amount);
    const paidCents = call.allocations.reduce((sum, allocation) => sum + toCents(allocation.amount), 0);
    const mine = own.get(call.id) ?? { cents: 0, source: 'PAYMENT' as const };
    return {
      chargeCallId: call.id,
      period: callPeriod(call),
      callAmount: fromCents(callCents),
      allocated: fromCents(mine.cents),
      source: mine.source,
      outstandingAfter: fromCents(Math.max(0, callCents - paidCents))
    };
  });

  const advanceCents = toCents(input.result.advance);
  const outstandingCents = allocations.map(allocation => toCents(allocation.outstandingAfter));
  if (!shouldIssueReceipt(outstandingCents, advanceCents)) return quittances;

  const payment = input.result.payment;
  const receipt = await createDocumentTx(tx, context, {
    kind: 'RECEIPT',
    issuedAt,
    amount: payment.amount,
    currency: input.result.currency,
    chargePaymentId: input.paymentId,
    actorUserId: input.actorUserId,
    build: number => ({
      ...emptySnapshotParts(),
      version: CHARGE_RECEIPT_SNAPSHOT_VERSION,
      kind: 'RECEIPT',
      number,
      issuedAt: issuedAt.toISOString(),
      currency: input.result.currency,
      amount: payment.amount,
      ...context.base,
      payment: {
        id: input.paymentId,
        amount: payment.amount,
        paidAt: new Date(payment.paidAt).toISOString(),
        method: payment.method,
        reference: payment.reference
      },
      allocations,
      outstandingAfter: fromCents(outstandingCents.reduce((sum, cents) => sum + cents, 0)),
      advance: input.result.advance,
      lotAdvanceBalance: input.result.lotAdvanceBalance
    })
  });
  return [...quittances, receipt];
}

/**
 * Création d'appel : quittance de chaque appel que l'avance du lot vient de
 * solder (`applyLotAdvanceTx`). `imputedCallIds` : appels touchés par
 * l'imputation.
 */
export async function issueQuittancesAfterAdvanceTx(
  tx: PrismaTransactionClient,
  input: { tenantId: string; syndicateId: string; lotId: string; imputedCallIds: string[]; actorUserId?: string | null }
): Promise<IssuedChargeDocument[]> {
  if (input.imputedCallIds.length === 0) return [];
  return issueQuittancesForSettledCallsTx(tx, {
    tenantId: input.tenantId,
    syndicateId: input.syndicateId,
    lotId: input.lotId,
    chargeCallIds: input.imputedCallIds,
    actorUserId: input.actorUserId
  });
}
