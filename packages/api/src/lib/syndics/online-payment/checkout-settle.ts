import { Prisma } from '@prisma/client';
import type { OnlineCheckoutStatus, SyndicOnlineCheckout } from '@prisma/client';
import { prisma } from '../../../utils/database';
import type { PrismaTransactionClient } from '../../../utils/database';
import { t } from '../../../i18n';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { ConflictError } from '../../../middleware/error-middleware';
import { recordLotPaymentTx } from '../charge-allocation';
import { issueReceiptsForPaymentTx, toDocumentRefs } from '../charge-receipts';
import type { IssuedChargeDocument } from '../charge-receipts';
import { assertFiscalYearOpenTx } from '../provider-invoice-accounting';
import type { DocumentRef, ReviewKind } from './types';

/**
 * Encaissement d'une tentative de paiement en ligne (spec 042, R15, R16, R18, R20).
 *
 * `settleSyndicCheckoutTx` est la SEULE fonction qui enregistre un encaissement
 * pour une tentative : le succès automatique (`checkout-reconcile.ts`) et la
 * décision `ACCEPT` du gestionnaire (`checkout-review.ts`) l'appellent, dans
 * leur propre transaction. Elle fait, dans CETTE transaction : claim atomique
 * de la tentative, `recordLotPaymentTx` (méthode `MOBILE_MONEY`, clé
 * d'idempotence = code de paiement, compte de trésorerie 5525, origine
 * `ONLINE`), reçus et quittances, `chargePaymentId`. L'envoi des documents se
 * fait par l'appelant APRÈS le commit.
 *
 * Un échec MÉTIER (exercice clos, appel disparu, transaction fournisseur déjà
 * enregistrée) lève `SyndicSettleBusinessError` : la transaction est annulée
 * (claim compris, rien n'est enregistré) et l'appelant décide (mise en revue
 * pour le succès automatique, erreur pour `ACCEPT`). Toute autre erreur
 * remonte telle quelle : la tentative reste `PENDING`, la tâche reprendra.
 */

export class SyndicSettleBusinessError extends Error {
  constructor(
    public readonly kind: ReviewKind,
    public readonly reason: string,
    public readonly originalError?: unknown
  ) {
    super(reason);
    this.name = 'SyndicSettleBusinessError';
  }
}

/**
 * Course perdue sur l'unicité de la clé d'idempotence : le paiement de cette
 * tentative existe déjà. La transaction PostgreSQL est abandonnée (P2002) ;
 * l'appelant la REJOUE une fois (hors transaction), le rejeu rattache alors le
 * paiement existant sans rien recréer.
 */
export class SyndicSettleReplayError extends Error {
  constructor() {
    super('Idempotency key already recorded');
    this.name = 'SyndicSettleReplayError';
  }
}

export interface SettleSyndicCheckoutParams {
  paidAt: Date;
  /** Montant encaissé, en FCFA (entier). */
  amount: number;
  /** Statuts depuis lesquels le claim est permis (`PENDING`…, ou `REVIEW` pour `ACCEPT`). */
  fromStatuses: OnlineCheckoutStatus[];
  /** Écrit par le claim : statut `SUCCESS`, suivi fournisseur, résolution éventuelle. */
  claimData: Prisma.SyndicOnlineCheckoutUpdateManyMutationInput;
  /** `true` (décision gestionnaire) : ne garde que les appels encore présents au lieu d'échouer. */
  tolerateMissingCalls?: boolean;
  /** Identifiant de transaction du fournisseur (à défaut, celui déjà noté sur la tentative). */
  providerTransactionId?: string | null;
  /** Gestionnaire qui encaisse (`ACCEPT`) ; nul pour le succès automatique. */
  actorUserId?: string | null;
}

export type SettleSyndicCheckoutResult =
  /** Un autre appel a pris la tentative (ou elle a déjà son encaissement) : rien n'a été écrit. */
  | { kind: 'LOST' }
  | {
      kind: 'SETTLED';
      paymentId: string;
      amount: number;
      unallocatedAmount: number;
      documents: IssuedChargeDocument[];
      /** `true` : le paiement existait déjà (rejeu), rattaché sans nouvelle écriture ni nouveaux documents. */
      replayed?: boolean;
    };

function uniqueViolationOn(error: unknown, column: RegExp): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const names = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  return names.some(name => column.test(name));
}

const isDuplicateTransactionError = (error: unknown) => uniqueViolationOn(error, /provider_?transaction_?id/i);
const isIdempotencyReplayError = (error: unknown) => uniqueViolationOn(error, /idempotency_?key/i);

const DUPLICATE_REASON = 'Cette transaction du fournisseur est déjà enregistrée sur un autre paiement.';

export async function settleSyndicCheckoutTx(
  tx: PrismaTransactionClient,
  checkout: Pick<
    SyndicOnlineCheckout,
    'id' | 'tenantId' | 'syndicateId' | 'lotId' | 'codePaiement' | 'chargeCallIds' | 'providerTransactionId'
  >,
  params: SettleSyndicCheckoutParams
): Promise<SettleSyndicCheckoutResult> {
  const { tenantId, syndicateId, lotId } = checkout;

  // 1. Claim atomique. Une tentative déjà encaissée ou déjà tranchée ne repasse jamais ici ;
  //    deux transactions concurrentes : la seconde attend le verrou de ligne puis ne trouve plus rien.
  const claim = await tx.syndicOnlineCheckout.updateMany({
    where: {
      id: checkout.id,
      tenantId,
      status: { in: params.fromStatuses },
      chargePaymentId: null,
      resolution: null
    },
    data: params.claimData
  });
  if (claim.count !== 1) return { kind: 'LOST' };

  // Rejeu : le paiement de cette tentative existe déjà (clé d'idempotence = code de paiement).
  // On le rattache sans rien recréer ; jamais de mise en revue pour un rejeu.
  const existing = await tx.chargePayment.findFirst({
    where: { idempotencyKey: checkout.codePaiement, lotId },
    select: { id: true, amount: true, unallocatedAmount: true }
  });
  if (existing) {
    await tx.syndicOnlineCheckout.update({
      where: { id: checkout.id, tenantId },
      data: { chargePaymentId: existing.id }
    });
    return {
      kind: 'SETTLED',
      paymentId: existing.id,
      amount: Number(existing.amount),
      unallocatedAmount: Number(existing.unallocatedAmount),
      documents: [],
      replayed: true
    };
  }

  // 2. Contrôles métier AVANT toute écriture comptable : ce sont eux qui classent en revue.
  try {
    await assertFiscalYearOpenTx(tx, syndicateId, params.paidAt);
  } catch (error) {
    if (error instanceof ConflictError) {
      throw new SyndicSettleBusinessError('FISCAL_YEAR_CLOSED', error.message, error);
    }
    throw error;
  }

  const present = await tx.chargeCall.findMany({
    where: { id: { in: checkout.chargeCallIds }, lotId, syndicateId },
    select: { id: true }
  });
  if (present.length < checkout.chargeCallIds.length && !params.tolerateMissingCalls) {
    throw new SyndicSettleBusinessError(
      'CALLS_UNAVAILABLE',
      t("Un appel de charges payé a disparu ou n'appartient plus à ce lot.")
    );
  }

  const providerTransactionId = params.providerTransactionId ?? checkout.providerTransactionId ?? null;
  if (providerTransactionId) {
    const duplicate = await tx.chargePayment.findFirst({ where: { providerTransactionId }, select: { id: true } });
    if (duplicate) throw new SyndicSettleBusinessError('DUPLICATE_TRANSACTION', t(DUPLICATE_REASON));
  }

  // 3. Encaissement du lot (affectation aux appels visés encore ouverts, reliquat en avance).
  let recorded: Awaited<ReturnType<typeof recordLotPaymentTx>>;
  try {
    recorded = await recordLotPaymentTx(tx, {
      tenantId,
      syndicateId,
      lotId,
      amount: params.amount,
      paidAt: params.paidAt,
      method: 'MOBILE_MONEY',
      reference: checkout.codePaiement,
      chargeCallIds: present.map(call => call.id),
      actorUserId: params.actorUserId ?? null,
      idempotencyKey: checkout.codePaiement,
      providerTransactionId,
      origin: 'ONLINE',
      treasuryAccountNumber: '5525'
    });
  } catch (error) {
    // P2002 : la transaction PostgreSQL est abandonnée, l'appelant décide hors transaction.
    if (isIdempotencyReplayError(error)) throw new SyndicSettleReplayError();
    if (isDuplicateTransactionError(error)) {
      throw new SyndicSettleBusinessError('DUPLICATE_TRANSACTION', t(DUPLICATE_REASON), error);
    }
    throw error;
  }

  // 4. Reçu et quittances, numérotés dans la même transaction.
  const documents = await issueReceiptsForPaymentTx(tx, {
    tenantId,
    syndicateId,
    lotId,
    paymentId: recorded.record.id,
    result: recorded.result,
    actorUserId: params.actorUserId ?? null
  });

  await tx.syndicOnlineCheckout.update({
    where: { id: checkout.id, tenantId },
    data: { chargePaymentId: recorded.record.id }
  });

  return {
    kind: 'SETTLED',
    paymentId: recorded.record.id,
    amount: recorded.result.payment.amount,
    unallocatedAmount: Number(recorded.record.unallocatedAmount),
    documents
  };
}

/**
 * Exécute `run` (une transaction de règlement) et la rejoue UNE fois si un
 * rejeu concurrent a gagné la course sur la clé d'idempotence.
 */
export async function withReplayRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof SyndicSettleReplayError)) throw error;
    return run();
  }
}

export function documentRefsOf(documents: IssuedChargeDocument[]): DocumentRef[] {
  return toDocumentRefs(documents) as DocumentRef[];
}

/**
 * Passe la tentative en `REVIEW` (rien n'est enregistré). Claim sur les statuts
 * de départ : renvoie `false` si un autre appel a déjà agi.
 */
export async function markSyndicCheckoutReview(
  checkout: Pick<SyndicOnlineCheckout, 'id' | 'tenantId' | 'codePaiement'>,
  review: {
    kind: ReviewKind;
    reason: string;
    fromStatuses: OnlineCheckoutStatus[];
    extra?: Prisma.SyndicOnlineCheckoutUpdateManyMutationInput;
  }
): Promise<boolean> {
  const claim = await prisma.syndicOnlineCheckout.updateMany({
    where: { id: checkout.id, tenantId: checkout.tenantId, status: { in: review.fromStatuses } },
    data: {
      ...review.extra,
      status: 'REVIEW',
      reviewKind: review.kind,
      reviewReason: review.reason,
      // Une nouvelle mise en revue annule une résolution précédente : il faut trancher à nouveau.
      resolution: null,
      resolutionNote: null,
      resolvedAt: null,
      resolvedByUserId: null
    }
  });
  if (claim.count !== 1) return false;
  logAuditEvent({
    actorUserId: null,
    tenantId: checkout.tenantId,
    actionKey: AuditActionKey.SYNDIC_ONLINE_PAYMENT_REVIEW,
    entityType: 'SyndicOnlineCheckout',
    entityId: checkout.id,
    payload: { checkoutId: checkout.id, codePaiement: checkout.codePaiement, reviewKind: review.kind }
  });
  return true;
}

/** Trace d'un encaissement confirmé (succès automatique ou décision `ACCEPT`). Jamais de clé ni de jeton. */
export function auditSyndicCheckoutConfirmed(
  checkout: Pick<SyndicOnlineCheckout, 'id' | 'tenantId' | 'codePaiement'>,
  settled: Extract<SettleSyndicCheckoutResult, { kind: 'SETTLED' }>,
  source: 'AUTO' | 'ACCEPT',
  actorUserId?: string | null
): void {
  logAuditEvent({
    actorUserId: actorUserId ?? null,
    tenantId: checkout.tenantId,
    actionKey: AuditActionKey.SYNDIC_ONLINE_PAYMENT_CONFIRMED,
    entityType: 'SyndicOnlineCheckout',
    entityId: checkout.id,
    payload: {
      checkoutId: checkout.id,
      codePaiement: checkout.codePaiement,
      chargePaymentId: settled.paymentId,
      amount: settled.amount,
      source
    }
  });
}
