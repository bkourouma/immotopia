import { Prisma } from '@prisma/client';
import type { OnlineCheckoutStatus, SyndicOnlineCheckout } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../../utils/database';
import { t } from '../../../i18n';
import { logger } from '../../../utils/logger';
import { runWithTenantContext } from '../../../utils/tenant-context';
import { AppError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { isSyndicCodePaiement } from '../../payment-gateway/codes';
import {
  CHECKOUT_RECHECK_INTERVAL_MS,
  decideCheckoutTransition,
  fetchNormalizedProviderStatus,
  isCheckoutExpired,
  reconcileCutoff
} from '../../payment-gateway/checkout-core';
import type { NormalizedProviderStatus } from '../../payment-gateway/checkout-core';
import { paymentGatewaySimulatorAvailable } from '../../../config/env';
import { gatewayClientForMode } from '../../payment-gateway/paysecurehub';
import { scheduleChargeDocumentDelivery } from '../charge-receipt-delivery';
import { loadSyndicGatewayConfigById, syndicCredentialsFrom } from './gateway-config';
import {
  auditSyndicCheckoutConfirmed,
  markSyndicCheckoutReview,
  settleSyndicCheckoutTx,
  SyndicSettleBusinessError,
  withReplayRetry
} from './checkout-settle';
import { toCheckoutRow } from './checkout-queries';
import type { VerifySyndicCheckoutResult } from './types';

/**
 * Rapprochement d'une tentative avec PaySecureHub (spec 042, R14 à R19).
 *
 * `reconcileSyndicCheckout*` est la SEULE porte qui change le statut d'une
 * tentative à partir du fournisseur. Appelée par l'IPN, la page du simulateur,
 * le portail et la page publique (statut), le bouton « Vérifier » et la tâche
 * planifiée. Le statut est TOUJOURS redemandé au fournisseur avec la clé de la
 * copropriété de la tentative ; le corps d'une IPN n'est jamais lu.
 *
 * Tentative en `REVIEW` : la vérification ne met à jour que le suivi (R19),
 * seule la décision du gestionnaire enregistre un encaissement.
 */

export type SyndicCheckoutRecord = SyndicOnlineCheckout;

export interface ReconcileSyndicResult {
  checkout: SyndicCheckoutRecord;
  /** `true` si le statut ou l'encaissement a changé pendant cet appel. */
  changed: boolean;
}

/** Statuts depuis lesquels un succès (ou une mise en revue) fournisseur est encore pris en compte. */
const OPEN_STATUSES: OnlineCheckoutStatus[] = ['PENDING', 'FAILED', 'CANCELED'];
const SETTLE_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

function providerUnreachable(): AppError {
  return new AppError(
    t("Le fournisseur de paiement n'a pas répondu."),
    502,
    ErrorCode.ONLINE_PAYMENT_PROVIDER_UNREACHABLE
  );
}

function bookkeepingOf(ps: NormalizedProviderStatus): Prisma.SyndicOnlineCheckoutUpdateManyMutationInput {
  return {
    lastProviderState: ps.rawState,
    lastProviderPayload: ps.raw === null || ps.raw === undefined ? Prisma.JsonNull : (ps.raw as Prisma.InputJsonValue),
    lastCheckedAt: new Date(),
    checkAttempts: { increment: 1 },
    ...(ps.providerTransactionId ? { providerTransactionId: ps.providerTransactionId } : {}),
    ...(ps.serviceName ? { providerServiceName: ps.serviceName, mmOperator: ps.operator } : {}),
    ...(ps.providerFees !== null ? { providerFees: new Decimal(ps.providerFees) } : {}),
    ...(ps.amount !== null ? { receivedAmount: new Decimal(ps.amount) } : {})
  };
}

async function reload(checkout: SyndicCheckoutRecord): Promise<SyndicCheckoutRecord> {
  return prisma.syndicOnlineCheckout.findFirstOrThrow({ where: { id: checkout.id, tenantId: checkout.tenantId } });
}

/** Met à jour le suivi seulement (aucun changement de statut ni d'encaissement). */
async function touch(
  checkout: SyndicCheckoutRecord,
  bookkeeping: Prisma.SyndicOnlineCheckoutUpdateManyMutationInput
): Promise<ReconcileSyndicResult> {
  const updated = await prisma.syndicOnlineCheckout.update({
    where: { id: checkout.id, tenantId: checkout.tenantId },
    data: bookkeeping
  });
  return { checkout: updated, changed: false };
}

/** Succès fournisseur : un seul encaissement, sinon mise en revue (rien d'enregistré). */
async function succeed(
  checkout: SyndicCheckoutRecord,
  ps: NormalizedProviderStatus,
  bookkeeping: Prisma.SyndicOnlineCheckoutUpdateManyMutationInput
): Promise<ReconcileSyndicResult> {
  const now = new Date();
  try {
    const settled = await withReplayRetry(() =>
      prisma.$transaction(
        tx =>
          settleSyndicCheckoutTx(tx, checkout, {
            paidAt: now,
            amount: Math.round(Number(checkout.amount)),
            fromStatuses: OPEN_STATUSES,
            claimData: { ...bookkeeping, status: 'SUCCESS', failureMessage: null, completedAt: now },
            providerTransactionId: ps.providerTransactionId
          }),
        SETTLE_TX_OPTIONS
      )
    );
    if (settled.kind === 'LOST') {
      // Un autre appel a pris la tentative (rejeu, IPN concurrente) ou elle est déjà tranchée : rien de plus.
      return { checkout: await reload(checkout), changed: false };
    }
    // Reçus et quittances : APRÈS le commit, leur échec n'annule jamais l'encaissement.
    scheduleChargeDocumentDelivery(checkout.tenantId, settled.documents);
    auditSyndicCheckoutConfirmed(checkout, settled, 'AUTO');
    return { checkout: await reload(checkout), changed: true };
  } catch (error) {
    if (!(error instanceof SyndicSettleBusinessError)) throw error; // reste PENDING, la tâche reprendra
    await markSyndicCheckoutReview(checkout, {
      kind: error.kind,
      reason: error.reason,
      fromStatuses: OPEN_STATUSES,
      extra: bookkeeping
    });
    return { checkout: await reload(checkout), changed: true };
  }
}

/** Échec ou annulation rapportés par le fournisseur : aucune écriture métier. */
async function closeUnpaid(
  checkout: SyndicCheckoutRecord,
  target: 'FAILED' | 'CANCELED',
  ps: NormalizedProviderStatus,
  bookkeeping: Prisma.SyndicOnlineCheckoutUpdateManyMutationInput
): Promise<ReconcileSyndicResult> {
  const claim = await prisma.syndicOnlineCheckout.updateMany({
    where: {
      id: checkout.id,
      tenantId: checkout.tenantId,
      status: { in: OPEN_STATUSES.filter(status => status !== target) },
      chargePaymentId: null,
      resolution: null
    },
    data: {
      ...bookkeeping,
      status: target,
      failureMessage: ps.error ?? checkout.failureMessage,
      completedAt: new Date()
    }
  });
  return { checkout: await reload(checkout), changed: claim.count === 1 };
}

async function applyProviderStatus(
  checkout: SyndicCheckoutRecord,
  ps: NormalizedProviderStatus
): Promise<ReconcileSyndicResult> {
  const bookkeeping = bookkeepingOf(ps);

  // R19 : en revue, ou déjà tranchée, la vérification ne fait que mettre le suivi à jour.
  if (checkout.status === 'REVIEW' || checkout.resolution) return touch(checkout, bookkeeping);

  // Succès sans montant rapporté : impossible de le rapprocher de la tentative, on ne l'encaisse pas.
  if (ps.state === 'SUCCESS' && ps.amount === null && OPEN_STATUSES.includes(checkout.status)) {
    const marked = await markSyndicCheckoutReview(checkout, {
      kind: 'AMOUNT_MISMATCH',
      reason: t('Le fournisseur confirme le paiement sans indiquer le montant reçu.'),
      fromStatuses: OPEN_STATUSES,
      extra: bookkeeping
    });
    return { checkout: await reload(checkout), changed: marked };
  }

  const decision = decideCheckoutTransition({
    currentStatus: checkout.status,
    expectedAmount: Number(checkout.amount),
    provider: ps
  });

  switch (decision.action) {
    case 'NOOP':
      return { checkout, changed: false };
    case 'TOUCH':
      return touch(checkout, bookkeeping);
    case 'REVIEW': {
      // Un succès déjà encaissé ne redescend jamais : état contraire à trancher, encaissement conservé.
      const contrary = checkout.status === 'SUCCESS';
      const marked = await markSyndicCheckoutReview(checkout, {
        kind: contrary ? 'CONTRARY_STATE' : 'AMOUNT_MISMATCH',
        reason: decision.reviewReason ?? '',
        fromStatuses: contrary ? ['SUCCESS'] : OPEN_STATUSES,
        extra: bookkeeping
      });
      return { checkout: await reload(checkout), changed: marked };
    }
    case 'SUCCEED':
      return succeed(checkout, ps, bookkeeping);
    case 'FAIL':
      return closeUnpaid(checkout, 'FAILED', ps, bookkeeping);
    default:
      return closeUnpaid(checkout, 'CANCELED', ps, bookkeeping);
  }
}

/** Cœur du rapprochement : statut fournisseur (clé de la copropriété) puis transition. */
async function reconcileRow(checkout: SyndicCheckoutRecord): Promise<ReconcileSyndicResult> {
  const config = await loadSyndicGatewayConfigById(checkout.tenantId, checkout.configId);
  // La configuration de la tentative doit être celle de SA copropriété : jamais une autre clé.
  if (!config || config.syndicateId !== checkout.syndicateId) {
    logger.warn('reconcileSyndicCheckout: configuration introuvable pour cette copropriété', {
      checkoutId: checkout.id
    });
    return { checkout, changed: false };
  }

  const credentials = syndicCredentialsFrom(config);
  let providerStatus: NormalizedProviderStatus;
  try {
    providerStatus = await fetchNormalizedProviderStatus(
      gatewayClientForMode(config.mode),
      credentials,
      checkout.codePaiement
    );
  } catch (error) {
    await prisma.syndicOnlineCheckout.updateMany({
      where: { id: checkout.id, tenantId: checkout.tenantId },
      data: { checkAttempts: { increment: 1 }, lastCheckedAt: new Date() }
    });
    logger.warn('reconcileSyndicCheckout: fournisseur injoignable', {
      checkoutId: checkout.id,
      error: (error as Error)?.message
    });
    throw providerUnreachable();
  }

  // Tentative expirée : seul un succès tardif est à trancher (l'argent est parti), le reste est ignoré.
  if (checkout.status === 'EXPIRED') {
    if (providerStatus.state !== 'SUCCESS') return { checkout, changed: false };
    const marked = await markSyndicCheckoutReview(checkout, {
      kind: 'CONTRARY_STATE',
      reason: t('Le fournisseur a encaissé ce paiement après son expiration.'),
      fromStatuses: ['EXPIRED'],
      extra: bookkeepingOf(providerStatus)
    });
    return { checkout: await reload(checkout), changed: marked };
  }

  return applyProviderStatus(checkout, providerStatus);
}

export interface ReconcileSyndicOptions {
  /** Restreint à une copropriété (route gestionnaire) : une autre répond le même 404. */
  syndicateId?: string;
  /** Bouton « Vérifier » : seulement `PENDING` ou `REVIEW`, sinon 409 `CHECKOUT_NOT_VERIFIABLE`. */
  verifiableOnly?: boolean;
}

/** Rapproche une tentative de l'agence. 404 si elle est inconnue ou d'une autre agence. */
export async function reconcileSyndicCheckout(
  tenantId: string,
  checkoutId: string,
  options: ReconcileSyndicOptions = {}
): Promise<ReconcileSyndicResult> {
  const checkout = await prisma.syndicOnlineCheckout.findFirst({
    where: { id: checkoutId, tenantId, ...(options.syndicateId ? { syndicateId: options.syndicateId } : {}) }
  });
  if (!checkout) throw new NotFoundError(t('Paiement en ligne introuvable.'));
  if (options.verifiableOnly && checkout.status !== 'PENDING' && checkout.status !== 'REVIEW') {
    throw new AppError(t("Ce paiement n'est ni en attente ni à vérifier."), 409, ErrorCode.CHECKOUT_NOT_VERIFIABLE);
  }
  return reconcileRow(checkout);
}

/** Bouton « Vérifier » du gestionnaire (contracts §1.6), réponse prête à renvoyer. */
export async function verifySyndicCheckout(
  tenantId: string,
  syndicateId: string,
  checkoutId: string
): Promise<VerifySyndicCheckoutResult> {
  const { checkout, changed } = await reconcileSyndicCheckout(tenantId, checkoutId, {
    syndicateId,
    verifiableOnly: true
  });
  return { checkout: await toCheckoutRow(checkout), changed };
}

/**
 * IPN et page du simulateur : ne connaît pas l'agence, le code de paiement est
 * la seule clé. `null` si le code n'est pas un code Syndic ou est inconnu ;
 * l'appelant répond alors 200 sans rien révéler. Le rapprochement tourne dans
 * le contexte de l'agence de la tentative (garde-fou Prisma). Une agence
 * suspendue voit quand même ses paiements rapprochés : l'argent est chez le
 * fournisseur.
 */
export async function reconcileSyndicCheckoutPublic(codePaiement: string): Promise<ReconcileSyndicResult | null> {
  if (!isSyndicCodePaiement(codePaiement)) return null;
  const checkout = await prisma.syndicOnlineCheckout.findFirst({ where: { codePaiement } });
  if (!checkout) return null;
  return runWithTenantContext({ tenantId: checkout.tenantId }, () => reconcileRow(checkout));
}

/**
 * Réservation atomique de la fenêtre de 10 s : un seul appel fournisseur par
 * fenêtre pour les lectures du portail et de la page publique.
 */
export async function claimStatusWindow(
  tenantId: string,
  checkoutId: string,
  now: number = Date.now()
): Promise<boolean> {
  const claim = await prisma.syndicOnlineCheckout.updateMany({
    where: {
      id: checkoutId,
      tenantId,
      status: 'PENDING',
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now - CHECKOUT_RECHECK_INTERVAL_MS) } }]
    },
    data: { lastCheckedAt: new Date(now) }
  });
  return claim.count === 1;
}

/**
 * Lecture du portail ou de la page publique : si la tentative est `PENDING` et
 * qu'aucun appel fournisseur n'a eu lieu dans la fenêtre, la rapproche. Toute
 * erreur est avalée (journalisée) : l'état stocké est renvoyé, la tâche
 * reprendra.
 */
export async function refreshSyndicCheckout(checkout: SyndicCheckoutRecord): Promise<SyndicCheckoutRecord> {
  if (checkout.status !== 'PENDING') return checkout;
  if (!(await claimStatusWindow(checkout.tenantId, checkout.id))) return checkout;
  try {
    return (await reconcileRow(checkout)).checkout;
  } catch (error) {
    logger.warn('refreshSyndicCheckout: rapprochement en échec, état stocké renvoyé', {
      checkoutId: checkout.id,
      error: (error as Error)?.message
    });
    return reload(checkout);
  }
}

// ---------------------------------------------------------------------------
// Simulateur (spec 042 : page et boutons publics, mode SIMULATOR seulement)
// ---------------------------------------------------------------------------

/**
 * Tentative du simulateur par son code. `null` si le code est inconnu, si la
 * copropriété n'est pas en mode simulateur ou si l'agence est suspendue : le
 * contrôleur répond alors 404 sans distinguer.
 */
export async function findSyndicSimulatorCheckout(codePaiement: string): Promise<SyndicCheckoutRecord | null> {
  if (!paymentGatewaySimulatorAvailable || !isSyndicCodePaiement(codePaiement)) return null;
  return prisma.syndicOnlineCheckout.findFirst({
    where: { codePaiement, config: { mode: 'SIMULATOR' }, tenant: { status: { not: 'SUSPENDED' } } }
  });
}

/** Enregistre l'issue choisie sur la page du simulateur (tentative encore en attente seulement). */
export async function recordSyndicSimulatedOutcome(
  checkout: SyndicCheckoutRecord,
  outcome: 'SUCCESS' | 'FAILED' | 'CANCELED'
): Promise<void> {
  await runWithTenantContext({ tenantId: checkout.tenantId }, () =>
    prisma.syndicOnlineCheckout.updateMany({
      where: { id: checkout.id, tenantId: checkout.tenantId, status: 'PENDING' },
      data: { simulatedOutcome: outcome }
    })
  );
}

// ---------------------------------------------------------------------------
// Tâche planifiée (spec 042 : ≥ 2 min, expiration 48 h)
// ---------------------------------------------------------------------------

async function expireSyndicCheckout(checkout: { id: string; tenantId: string }): Promise<boolean> {
  const claim = await prisma.syndicOnlineCheckout.updateMany({
    where: { id: checkout.id, tenantId: checkout.tenantId, status: 'PENDING', chargePaymentId: null },
    data: { status: 'EXPIRED', completedAt: new Date() }
  });
  return claim.count === 1;
}

const JOB_BATCH_SIZE = 500;

/**
 * Rapproche les tentatives `PENDING` créées il y a plus de 2 minutes et expire
 * (après une dernière vérification RÉUSSIE) celles de plus de 48 heures : si
 * le fournisseur ne répond pas, la tentative n'expire pas, un vrai paiement ne
 * se perd pas. Chaque tentative tourne dans le contexte de son agence.
 */
export async function reconcilePendingSyndicCheckouts(): Promise<{
  reconciled: number;
  expired: number;
  errors: number;
}> {
  const now = Date.now();
  const pending = await prisma.syndicOnlineCheckout.findMany({
    where: { status: 'PENDING', createdAt: { lte: reconcileCutoff(now) } },
    select: { id: true, tenantId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: JOB_BATCH_SIZE
  });

  let reconciled = 0;
  let expired = 0;
  let errors = 0;
  for (const row of pending) {
    let verifiedStillPending = false;
    try {
      const result = await runWithTenantContext({ tenantId: row.tenantId }, () =>
        reconcileSyndicCheckout(row.tenantId, row.id)
      );
      reconciled++;
      verifiedStillPending = result.checkout.status === 'PENDING';
    } catch (error) {
      errors++;
      logger.warn('reconcilePendingSyndicCheckouts: échec du rapprochement', {
        checkoutId: row.id,
        error: (error as Error)?.message
      });
    }

    if (verifiedStillPending && isCheckoutExpired(row.createdAt, now)) {
      try {
        if (await runWithTenantContext({ tenantId: row.tenantId }, () => expireSyndicCheckout(row))) expired++;
      } catch (error) {
        errors++;
        logger.warn("reconcilePendingSyndicCheckouts: échec de l'expiration", {
          checkoutId: row.id,
          error: (error as Error)?.message
        });
      }
    }
  }
  return { reconciled, expired, errors };
}
