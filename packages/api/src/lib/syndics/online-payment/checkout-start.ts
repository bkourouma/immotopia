import { Decimal } from '@prisma/client/runtime/library';
import type { SyndicOnlineCheckout, SyndicPaymentGatewayConfig } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { env } from '../../../config/env';
import { t } from '../../../i18n';
import { logger } from '../../../utils/logger';
import { AppError, BadRequestError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { generateSyndicCodePaiement } from '../../payment-gateway/codes';
import { requestProviderCheckoutRedirect } from '../../payment-gateway/checkout-core';
import { gatewayClientForMode } from '../../payment-gateway/paysecurehub';
import { sumAllocationsByCall } from '../charge-allocation';
import { toCents } from '../charge-allocation-plan';
import { pendingDeclarationsByCall } from '../declared-payment/declaration-queries';
import { lockLotPayment } from '../lot-payment-lock';
import { assertSyndicOnlinePaymentAllowed } from './feature-gate';
import { assertSyndicConfigUsable, loadSyndicGatewayConfig, syndicCredentialsFrom } from './gateway-config';
import { isSupportedCurrency } from './types';
import type { CheckoutOrigin } from './types';

/**
 * Démarrage d'un paiement en ligne d'appels de charges (spec 042, R7 à R13).
 *
 * Ordre voulu : droit SYNDIC, configuration de LA copropriété (chargée avant
 * toute transaction), puis, sous verrou consultatif `(tenantId, lotId)`,
 * chevauchements d'abord, appels et restes dus ensuite, création de la
 * tentative `PENDING`. L'appel `build-away` se fait HORS transaction.
 * Aucun montant, aucune agence, aucune copropriété n'est lu d'une requête :
 * l'appelant (portail, lien) fournit des identifiants déjà contrôlés, et tout
 * est revérifié ici contre l'agence.
 */

/** Un `PENDING` plus récent que cela est repris ou bloque (R10). */
export const PENDING_REUSE_WINDOW_MS = 15 * 60 * 1000;
export const MAX_CHARGE_CALLS_PER_CHECKOUT = 24;

export interface StartSyndicCheckoutParams {
  tenantId: string;
  syndicateId: string;
  lotId: string;
  chargeCallIds: string[];
  origin: CheckoutOrigin;
  /** Compte portail du copropriétaire (origine `PORTAL`). */
  tenantClientId?: string | null;
  /** Lien sécurisé à l'origine (origine `SECURE_LINK`) : l'identifiant, jamais le jeton. */
  secureLinkId?: string | null;
  /** `CrmContact.id` du payeur résolu par l'appelant (copropriétaire réel). */
  payerContactId: string | null;
  /** Utilisateur à l'origine (créateur du lien) ; nul pour le portail et les liens automatiques. */
  actorUserId?: string | null;
}

export interface StartSyndicCheckoutResult {
  checkout: SyndicOnlineCheckout;
  /** `true` si un `PENDING` identique et récent a été repris (même `checkoutUrl`). */
  reused: boolean;
}

/** URL de retour du payeur après le fournisseur ; ne contient que le code de paiement. */
export function syndicCheckoutReturnUrl(checkout: { origin: CheckoutOrigin | string; codePaiement: string }): string {
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  const code = encodeURIComponent(checkout.codePaiement);
  return checkout.origin === 'SECURE_LINK'
    ? `${base}/payer-charges/statut?paiement=${code}`
    : `${base}/copropriete/appels?paiement=${code}`;
}

interface PreparedCalls {
  /** Appels triés par échéance. */
  orderedIds: string[];
  /** Entier, en FCFA. */
  amount: number;
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Appels du lot (même copropriété, même lot), restes dus recalculés, montant entier. */
async function prepareCalls(tx: TxClient, params: StartSyndicCheckoutParams, ids: string[]): Promise<PreparedCalls> {
  const calls = await tx.chargeCall.findMany({
    where: { id: { in: ids }, lotId: params.lotId, syndicateId: params.syndicateId },
    select: { id: true, amount: true, currency: true, dueDate: true, createdAt: true }
  });
  if (calls.length !== ids.length) throw new NotFoundError(t('Appel de charges introuvable.'));
  if (!calls.every(call => isSupportedCurrency(call.currency))) {
    throw new AppError(
      t('Le paiement en ligne est limité aux appels en francs CFA.'),
      400,
      ErrorCode.ONLINE_PAYMENT_CURRENCY_UNSUPPORTED
    );
  }

  const paidByCall = await sumAllocationsByCall(tx, ids);
  let outstandingTotal = 0;
  for (const call of calls) {
    const outstanding = toCents(call.amount) - (paidByCall.get(call.id) ?? 0);
    if (outstanding <= 0) {
      throw new AppError(
        t('Un appel de charges sélectionné est déjà soldé.'),
        400,
        ErrorCode.CHARGE_CALL_ALREADY_SETTLED
      );
    }
    outstandingTotal += outstanding;
  }
  // PaySecureHub attend un montant entier (FCFA) : l'écart (< 1 FCFA) est absorbé par l'affectation.
  const amount = Math.round(outstandingTotal / 100);
  if (amount <= 0) {
    throw new AppError(
      t("Aucun appel de charges sélectionné n'a de reste dû."),
      400,
      ErrorCode.ONLINE_PAYMENT_NOTHING_DUE
    );
  }
  const orderedIds = [...calls]
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime())
    .map(call => call.id);
  return { orderedIds, amount };
}

type OverlapRow = {
  id: string;
  status: string;
  origin: string;
  tenantClientId: string | null;
  chargeCallIds: string[];
  amount: Decimal;
  checkoutUrl: string | null;
  codePaiement: string;
  config: { mode: string };
};

const sameSet = (a: string[], b: string[]) => a.length === b.length && b.every(id => a.includes(id));

/** Reprise (ou refus 409) d'un paiement déjà ouvert sur un des appels — contracts §2.3. */
function resolveOverlap(
  overlapping: OverlapRow[],
  params: StartSyndicCheckoutParams,
  prepared: PreparedCalls,
  config: SyndicPaymentGatewayConfig
): string | null {
  if (overlapping.length === 0) return null;
  if (overlapping.some(row => row.status === 'REVIEW')) {
    throw new AppError(
      params.origin === 'SECURE_LINK'
        ? t('Votre paiement est en cours de vérification par le syndic. Contactez votre syndic.')
        : t('Un paiement en ligne est en cours de vérification par le syndic pour cet appel.'),
      409,
      ErrorCode.ONLINE_PAYMENT_UNDER_REVIEW
    );
  }
  const exact = overlapping.find(
    row =>
      row.status === 'PENDING' &&
      row.origin === params.origin &&
      row.config.mode === config.mode &&
      sameSet(row.chargeCallIds, prepared.orderedIds) &&
      Math.round(Number(row.amount)) === prepared.amount &&
      Boolean(row.checkoutUrl) &&
      (params.origin === 'PORTAL' ? row.tenantClientId === (params.tenantClientId ?? null) : true)
  );
  if (overlapping.length === 1 && exact) return exact.id;

  // `data` : seulement pour un paiement du portail de CE copropriétaire, déjà muni de son URL.
  const visible = overlapping.find(
    row =>
      row.origin === 'PORTAL' &&
      params.origin === 'PORTAL' &&
      row.tenantClientId === (params.tenantClientId ?? null) &&
      Boolean(row.checkoutUrl)
  );
  throw new AppError(
    params.origin === 'SECURE_LINK'
      ? t('Un paiement en ligne est déjà en cours pour cet appel.')
      : t('Un paiement en ligne est déjà en cours pour ces appels.'),
    409,
    ErrorCode.ONLINE_PAYMENT_IN_PROGRESS,
    undefined,
    visible ? { codePaiement: visible.codePaiement, checkoutUrl: visible.checkoutUrl } : undefined
  );
}

/** Nom, téléphone et e-mail du payeur pour `build-away` ; une valeur absente reste vide plutôt que bloquer. */
async function payerInfo(tenantId: string, contactId: string | null) {
  const contact = contactId
    ? await prisma.crmContact.findFirst({
        where: { id: contactId, tenantId },
        select: {
          firstName: true,
          lastName: true,
          legalName: true,
          email: true,
          phonePrimary: true,
          whatsappNumber: true
        }
      })
    : null;
  return {
    nom: contact?.lastName?.trim() || contact?.legalName?.trim() || 'Copropriétaire',
    prenom: contact?.firstName?.trim() || '',
    telephone: contact?.phonePrimary || contact?.whatsappNumber || '',
    email: contact?.email || ''
  };
}

/** Marque la tentative `FAILED` (sans jamais écraser un succès arrivé entre-temps) et lève 502. */
async function failStart(checkout: SyndicOnlineCheckout, error: unknown): Promise<never> {
  await prisma.syndicOnlineCheckout.updateMany({
    where: { id: checkout.id, tenantId: checkout.tenantId, status: 'PENDING' },
    data: { status: 'FAILED', failureMessage: 'Le fournisseur de paiement n’a pas répondu.', completedAt: new Date() }
  });
  // Ni l'URL ni la clé dans le journal : seulement le message de l'erreur.
  logger.warn('startSyndicCheckout: build-away a échoué, tentative marquée FAILED', {
    checkoutId: checkout.id,
    error: (error as Error)?.message
  });
  throw new AppError(
    t("Impossible de créer le paiement en ligne : l'agrégateur n'a pas répondu."),
    502,
    ErrorCode.ONLINE_PAYMENT_PROVIDER_UNREACHABLE
  );
}

function declarationPendingError(chargeCallIds: string[]): AppError {
  return new AppError(
    t('Un paiement mobile money déclaré est en cours de vérification pour cet appel.'),
    409,
    ErrorCode.CHARGE_CALL_DECLARATION_PENDING,
    undefined,
    { chargeCallIds }
  );
}

/**
 * Démarre (ou reprend) le paiement en ligne d'appels entiers d'un lot.
 * Lève 403 `SYNDIC_FEATURE_DENIED`, 404 (lot ou appel hors de l'agence), 400
 * (`ONLINE_PAYMENT_UNAVAILABLE`, `CHARGE_CALL_ALREADY_SETTLED`,
 * `ONLINE_PAYMENT_NOTHING_DUE`, `ONLINE_PAYMENT_CURRENCY_UNSUPPORTED`), 409
 * (`ONLINE_PAYMENT_IN_PROGRESS`, `ONLINE_PAYMENT_UNDER_REVIEW`) ou 502
 * (`ONLINE_PAYMENT_PROVIDER_UNREACHABLE`, tentative alors `FAILED`).
 */
export async function startSyndicCheckout(params: StartSyndicCheckoutParams): Promise<StartSyndicCheckoutResult> {
  const { tenantId, syndicateId, lotId } = params;
  const ids = Array.from(new Set(params.chargeCallIds));
  if (ids.length < 1 || ids.length > MAX_CHARGE_CALLS_PER_CHECKOUT) {
    throw new BadRequestError(t('Sélectionnez de 1 à 24 appels de charges.'));
  }

  await assertSyndicOnlinePaymentAllowed(tenantId);

  // Le lot appartient à la copropriété de l'agence ; sinon le même 404 qu'un lot inexistant.
  const lot = await prisma.syndicateLot.findFirst({
    where: { id: lotId, syndicateId, syndicate: { tenantId } },
    select: { id: true }
  });
  if (!lot) throw new NotFoundError(t('Lot introuvable.'));

  // Spec 047 (R15) : un appel visé par un paiement mobile money déclaré en attente ne se paie pas en
  // ligne en même temps (risque de double paiement). Relu AVANT la transaction (lecture hors `tx`).
  const declared = await pendingDeclarationsByCall(tenantId, [lotId]);
  const blockedCallIds = ids.filter(id => declared.has(id));
  if (blockedCallIds.length > 0) throw declarationPendingError(blockedCallIds);

  // Chargée AVANT la transaction (aucune requête hors `tx` pendant qu'elle tient une connexion).
  const config = assertSyndicConfigUsable(await loadSyndicGatewayConfig(tenantId, syndicateId));
  const codePaiement = generateSyndicCodePaiement();
  const lockKey = `syndic-online-start:${tenantId}:${lotId}`;

  const outcome = await prisma.$transaction(async tx => {
    // Verrou libéré au COMMIT : sérialise les démarrages concurrents d'un même lot.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    // Verrou commun avec la création d'une déclaration (cas limite 9) PUIS relecture des déclarations
    // en attente : une déclaration validée avant ce verrou est vue ici, une déclaration concurrente
    // attend la fin de cette transaction et voit alors le paiement en ligne.
    await lockLotPayment(tx, [lotId]);
    const declaredNow = await pendingDeclarationsByCall(tenantId, [lotId], tx);
    const blockedNow = ids.filter(id => declaredNow.has(id));
    if (blockedNow.length > 0) throw declarationPendingError(blockedNow);

    // Chevauchements D'ABORD, appels et restes dus ensuite : un succès conclu entre les deux lectures
    // est vu côté appel (soldé) et ne laisse pas passer un doublon.
    const since = new Date(Date.now() - PENDING_REUSE_WINDOW_MS);
    const overlapping = (await tx.syndicOnlineCheckout.findMany({
      where: {
        tenantId,
        lotId,
        chargeCallIds: { hasSome: ids },
        OR: [{ status: 'PENDING', createdAt: { gte: since } }, { status: 'REVIEW' }]
      },
      select: {
        id: true,
        status: true,
        origin: true,
        tenantClientId: true,
        chargeCallIds: true,
        amount: true,
        checkoutUrl: true,
        codePaiement: true,
        config: { select: { mode: true } }
      }
    })) as OverlapRow[];

    const prepared = await prepareCalls(tx, params, ids);
    const reusedId = resolveOverlap(overlapping, params, prepared, config);
    if (reusedId) return { kind: 'reused' as const, id: reusedId };

    const created = await tx.syndicOnlineCheckout.create({
      data: {
        tenantId,
        syndicateId,
        lotId,
        configId: config.id,
        origin: params.origin,
        tenantClientId: params.tenantClientId ?? null,
        secureLinkId: params.secureLinkId ?? null,
        contactId: params.payerContactId,
        codePaiement,
        amount: new Decimal(prepared.amount),
        currency: 'FCFA',
        chargeCallIds: prepared.orderedIds,
        status: 'PENDING',
        createdByUserId: params.actorUserId ?? null
      }
    });
    return { kind: 'created' as const, row: created, amount: prepared.amount };
  });

  if (outcome.kind === 'reused') {
    const existing = await prisma.syndicOnlineCheckout.findFirstOrThrow({ where: { id: outcome.id, tenantId } });
    return { checkout: existing, reused: true };
  }

  const created = outcome.row;
  logAuditEvent({
    actorUserId: params.actorUserId ?? null,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_ONLINE_PAYMENT_STARTED,
    entityType: 'SyndicOnlineCheckout',
    entityId: created.id,
    payload: {
      checkoutId: created.id,
      codePaiement,
      syndicateId,
      lotId,
      origin: params.origin,
      amount: outcome.amount,
      chargeCallIds: created.chargeCallIds
    }
  });

  try {
    const payer = await payerInfo(tenantId, params.payerContactId);
    const redirect = await requestProviderCheckoutRedirect({
      client: gatewayClientForMode(config.mode),
      credentials: syndicCredentialsFrom(config),
      mode: config.mode,
      codePaiement,
      payer,
      libelleArticle: 'Charges de copropriété',
      libOrder: `Paiement charges ${codePaiement}`,
      amount: outcome.amount,
      returnUrl: syndicCheckoutReturnUrl({ origin: params.origin, codePaiement }),
      // Chemins publics : une URL refusée n'est jamais stockée (la tentative passe FAILED).
      validateUrl: true
    });
    const updated = await prisma.syndicOnlineCheckout.update({
      where: { id: created.id, tenantId },
      data: { checkoutUrl: redirect.url, providerToken: redirect.token }
    });
    return { checkout: updated, reused: false };
  } catch (error) {
    return failStart(created, error);
  }
}
