/**
 * Lien « Payer cet appel » des charges de copropriété (lot M6, spec 042).
 *
 * Un lien = un appel de charges (`SecureLink` de portée CHARGE_CALL_PAYMENT,
 * `objectType = 'ChargeCall'`). Calqué sur `payment-gateway/installment-payment-link`
 * (spec 039). Le MONTANT n'est jamais dans le lien ni lu de l'appelant : il est
 * recalculé ici (reste dû des affectations) à chaque ouverture et chaque
 * démarrage. Côté public, seul le jeton (ou le code de paiement) entre : tout
 * le reste vient de la base, dans l'agence du lien. Tout refus public est la
 * même `invalidSecureLinkError()` (404 uniforme), quelle qu'en soit la cause.
 *
 * Le jeton n'est ni stocké (empreinte seule), ni journalisé, ni dans une URL de
 * requête : il voyage dans le corps JSON des routes publiques.
 */
import { prisma } from '../../../utils/database';
import { env } from '../../../config/env';
import { t } from '../../../i18n';
import { logger } from '../../../utils/logger';
import { runWithTenantContext } from '../../../utils/tenant-context';
import { AppError, BadRequestError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import {
  createSecureLink,
  invalidSecureLinkError,
  listSecureLinks,
  recordSecureLinkView,
  revokeSecureLink,
  verifySecureLink
} from '../../secure-links';
import type { CreatedSecureLink, VerifiedSecureLink } from '../../secure-links';
import { normalizeProviderCheckoutUrl } from '../../payment-gateway/checkout-core';
import { sumAllocationsByCall } from '../charge-allocation';
import { toCents } from '../charge-allocation-plan';
import { resolveChargeCallRecipient } from '../notifications';
import { PENDING_REUSE_WINDOW_MS, startSyndicCheckout } from './checkout-start';
import { refreshSyndicCheckout } from './checkout-reconcile';
import { toPublicStatus } from './checkout-queries';
import { getSyndicOnlineAvailability, unavailableError } from './gateway-config';
import { ONLINE_PAYMENT_CHANNELS, isSupportedCurrency } from './types';
import type {
  FeesPaidBy,
  GatewayMode,
  OnlineCheckoutStatus,
  OnlinePaymentChannel,
  PublicCheckoutStatus
} from './types';

export const CHARGE_CALL_OBJECT_TYPE = 'ChargeCall';
export const CHARGE_CALL_LINK_SCOPE = 'CHARGE_CALL_PAYMENT' as const;

const CODE_PAIEMENT_PATTERN = /^IMS-[A-Za-z0-9]{20}$/;

// ---------------------------------------------------------------------------
// Types (contracts §1.10 et §3)
// ---------------------------------------------------------------------------

export interface ChargeCallPaymentPublicDto {
  syndicateName: string;
  lotLabel: string;
  period: string;
  dueDate: string;
  amountDue: number;
  currency: string;
  expiresAt: string;
  paymentMethods: OnlinePaymentChannel[];
  simulated: boolean;
  feesPaidBy: FeesPaidBy;
  paymentInProgress: boolean;
  reviewPending: boolean;
}

export interface ChargeCallPaymentStatusDto {
  status: PublicCheckoutStatus;
  amount: number;
  currency: string;
  syndicateName: string;
  period: string;
}

export interface ChargeCallPaymentLinkSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  viewCount: number;
  lastViewedAt: string | null;
  createdByUserId: string | null;
  payment: {
    status: 'NONE' | OnlineCheckoutStatus;
    amount: number | null;
    updatedAt: string | null;
  };
}

/** Ce que le lien permet de payer, relu en base à chaque usage. */
export interface ChargeCallPaymentContext {
  chargeCallId: string;
  syndicateId: string;
  lotId: string;
  syndicateName: string;
  lotLabel: string;
  period: string;
  dueDate: Date;
  /** Reste dû, entier en FCFA. */
  amountDue: number;
  currency: string;
  mode: GatewayMode;
  simulated: boolean;
  feesPaidBy: FeesPaidBy;
  /** `CrmContact.id` du copropriétaire principal actuel (null : lot ancien sans fiche). */
  payerContactId: string | null;
  /** Contact désigné par le lot (`ownerContactId` puis `coownerId`), destinataire d'un envoi. */
  lotRecipientContactId: string | null;
}

export type ChargeCallContextFailure =
  | 'NOT_FOUND'
  | 'SETTLED'
  | 'CURRENCY_UNSUPPORTED'
  | 'NOT_CONFIGURED'
  | 'SUBSCRIPTION'
  /** Le copropriétaire actuel est propriétaire depuis APRÈS la période de l'appel : il relève de l'ancien. */
  | 'OWNER_CHANGED';

// ---------------------------------------------------------------------------
// Lot revendu (R27)
// ---------------------------------------------------------------------------

/** Contact d'un copropriétaire actuel du lot, ou `null` quand le lot n'a pas (ou plus) de fiche de propriété. */
async function currentPrincipalOwner(
  lotId: string,
  now: Date
): Promise<{ contactId: string; ownedSince: Date } | null | 'NO_PROFILE'> {
  const profiles = await prisma.lotOwnerProfile.findMany({
    where: { lotId, isActive: true },
    select: { contactId: true, ownershipPercentage: true, ownedSince: true, ownedUntil: true }
  });
  const current = profiles.filter(profile => !profile.ownedUntil || profile.ownedUntil.getTime() >= now.getTime());
  // Lot ancien sans fiche de copropriétaire actif : comportement historique (comme les avis d'appel).
  if (current.length === 0) return 'NO_PROFILE';
  const [principal] = [...current].sort(
    (a, b) =>
      Number(b.ownershipPercentage) - Number(a.ownershipPercentage) ||
      a.ownedSince.getTime() - b.ownedSince.getTime() ||
      a.contactId.localeCompare(b.contactId)
  );
  return { contactId: principal.contactId, ownedSince: principal.ownedSince };
}

/**
 * Le contact est-il un copropriétaire actuel du lot ? Même règle que
 * `isCurrentLotOwner` des avis d'appel (non exportée de `notifications.ts`) :
 * sans fiche active, le lot garde le comportement historique (oui).
 */
export async function isCurrentLotOwnerContact(lotId: string, contactId: string, now = new Date()): Promise<boolean> {
  const profiles = await prisma.lotOwnerProfile.findMany({
    where: { lotId, isActive: true },
    select: { contactId: true, ownedUntil: true }
  });
  const current = profiles.filter(profile => !profile.ownedUntil || profile.ownedUntil.getTime() >= now.getTime());
  return current.length === 0 || current.some(profile => profile.contactId === contactId);
}

// ---------------------------------------------------------------------------
// Contexte de paiement d'un appel
// ---------------------------------------------------------------------------

/**
 * Lit l'appel (par id ET agence ; copropriété et lot facultativement imposés) et
 * vérifie tout ce qui le rend payable en ligne : copropriété configurée, droit
 * SYNDIC, devise FCFA, reste dû > 0, copropriétaire actuel propriétaire depuis
 * avant l'appel. Ne lève pas : l'appelant choisit le refus (404 uniforme
 * public, 404/400 gestionnaire).
 */
export async function loadChargeCallPaymentContext(
  tenantId: string,
  chargeCallId: string,
  scope: { syndicateId?: string; lotId?: string } = {}
): Promise<ChargeCallPaymentContext | { failure: ChargeCallContextFailure }> {
  const call = await prisma.chargeCall.findFirst({
    where: {
      id: chargeCallId,
      ...(scope.syndicateId ? { syndicateId: scope.syndicateId } : {}),
      ...(scope.lotId ? { lotId: scope.lotId } : {}),
      syndicate: { tenantId }
    },
    select: {
      id: true,
      syndicateId: true,
      lotId: true,
      period: true,
      periodStart: true,
      dueDate: true,
      amount: true,
      currency: true,
      syndicate: { select: { name: true } },
      lot: { select: { lotNumber: true, ownerContactId: true, coownerId: true } }
    }
  });
  if (!call) return { failure: 'NOT_FOUND' };

  const availability = await getSyndicOnlineAvailability(tenantId, call.syndicateId);
  if (!availability.available || !availability.mode) {
    return { failure: availability.unavailableReason === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'NOT_CONFIGURED' };
  }
  if (!isSupportedCurrency(call.currency)) return { failure: 'CURRENCY_UNSUPPORTED' };

  const paid = (await sumAllocationsByCall(prisma, [call.id])).get(call.id) ?? 0;
  const amountDue = Math.round((toCents(call.amount) - paid) / 100);
  if (amountDue <= 0) return { failure: 'SETTLED' };

  // Règle unique du destinataire (`ownerContactId` puis `coownerId`).
  const lotRecipientContactId = call.lot
    ? resolveChargeCallRecipient<string>({
        ownerContactId: call.lot.ownerContactId,
        coownerId: call.lot.coownerId,
        owner: call.lot.ownerContactId,
        coowner: call.lot.coownerId
      })
    : null;
  const principal = await currentPrincipalOwner(call.lotId, new Date());
  let payerContactId: string | null = lotRecipientContactId;
  if (principal !== 'NO_PROFILE' && principal) {
    // L'appel relève du propriétaire de sa période : dates de jour, comparées en UTC.
    const reference = call.periodStart ?? call.dueDate;
    if (principal.ownedSince.getTime() > reference.getTime()) return { failure: 'OWNER_CHANGED' };
    payerContactId = principal.contactId;
  }

  return {
    chargeCallId: call.id,
    syndicateId: call.syndicateId,
    lotId: call.lotId,
    syndicateName: call.syndicate?.name ?? '',
    lotLabel: t('Lot {{number}}', { number: call.lot?.lotNumber ?? '' }).trim(),
    period: call.period,
    dueDate: call.dueDate,
    amountDue,
    currency: call.currency,
    mode: availability.mode,
    simulated: availability.simulated,
    feesPaidBy: availability.feesPaidBy,
    payerContactId,
    lotRecipientContactId
  };
}

function failureToError(failure: ChargeCallContextFailure): Error {
  switch (failure) {
    case 'NOT_FOUND':
      return new NotFoundError(t('Appel de charges introuvable.'));
    case 'SETTLED':
      return new AppError(t('Cet appel de charges est déjà soldé.'), 400, ErrorCode.ONLINE_PAYMENT_NOTHING_DUE);
    case 'CURRENCY_UNSUPPORTED':
      return new AppError(
        t('Le paiement en ligne est limité aux appels en francs CFA.'),
        400,
        ErrorCode.ONLINE_PAYMENT_CURRENCY_UNSUPPORTED
      );
    case 'NOT_CONFIGURED':
      return unavailableError();
    case 'SUBSCRIPTION':
      return new AppError(
        t("Le paiement en ligne n'est pas disponible pour cette agence."),
        403,
        ErrorCode.SYNDIC_FEATURE_DENIED
      );
    case 'OWNER_CHANGED':
      return new BadRequestError(
        t("Le lot a changé de copropriétaire depuis cet appel : il relève de l'ancien copropriétaire.")
      );
  }
}

/** Contexte d'un appel de la copropriété de l'agence, ou l'erreur gestionnaire correspondante. */
export async function requirePayableChargeCall(
  tenantId: string,
  syndicateId: string,
  chargeCallId: string
): Promise<ChargeCallPaymentContext> {
  const loaded = await loadChargeCallPaymentContext(tenantId, chargeCallId, { syndicateId });
  if ('failure' in loaded) throw failureToError(loaded.failure);
  return loaded;
}

async function pendingCheckoutState(
  tenantId: string,
  context: Pick<ChargeCallPaymentContext, 'lotId' | 'chargeCallId'>
): Promise<{ paymentInProgress: boolean; reviewPending: boolean }> {
  // PENDING dans la fenêtre de reprise ; REVIEW (à trancher par le syndic) sans limite d'âge.
  const rows = await prisma.syndicOnlineCheckout.findMany({
    where: {
      tenantId,
      lotId: context.lotId,
      chargeCallIds: { hasSome: [context.chargeCallId] },
      OR: [
        { status: 'PENDING', createdAt: { gte: new Date(Date.now() - PENDING_REUSE_WINDOW_MS) } },
        { status: 'REVIEW' }
      ]
    },
    select: { status: true }
  });
  return {
    paymentInProgress: rows.some(row => row.status === 'PENDING'),
    reviewPending: rows.some(row => row.status === 'REVIEW')
  };
}

// ---------------------------------------------------------------------------
// Côté gestionnaire
// ---------------------------------------------------------------------------

/** Crée le lien d'un appel déjà vérifié payable (`requirePayableChargeCall`). */
export async function createChargeCallPaymentLinkFor(
  tenantId: string,
  context: ChargeCallPaymentContext,
  actorUserId: string | null,
  opts?: { ttlDays?: number }
): Promise<CreatedSecureLink> {
  return createSecureLink({
    tenantId,
    scope: CHARGE_CALL_LINK_SCOPE,
    objectType: CHARGE_CALL_OBJECT_TYPE,
    objectId: context.chargeCallId,
    createdByUserId: actorUserId,
    ttlDays: opts?.ttlDays
  });
}

export async function createChargeCallPaymentLink(
  tenantId: string,
  syndicateId: string,
  chargeCallId: string,
  actorUserId: string | null,
  opts?: { ttlDays?: number }
): Promise<{ link: CreatedSecureLink; context: ChargeCallPaymentContext }> {
  const context = await requirePayableChargeCall(tenantId, syndicateId, chargeCallId);
  const link = await createChargeCallPaymentLinkFor(tenantId, context, actorUserId, opts);
  return { link, context };
}

/** L'appel appartient à la copropriété ET à l'agence ; sinon le même 404 qu'un appel inexistant. */
async function assertChargeCallBelongs(tenantId: string, syndicateId: string, chargeCallId: string): Promise<void> {
  const call = await prisma.chargeCall.findFirst({
    where: { id: chargeCallId, syndicateId, syndicate: { tenantId } },
    select: { id: true }
  });
  if (!call) throw new NotFoundError(t('Appel de charges introuvable.'));
}

export async function listChargeCallPaymentLinks(
  tenantId: string,
  syndicateId: string,
  chargeCallId: string
): Promise<ChargeCallPaymentLinkSummary[]> {
  await assertChargeCallBelongs(tenantId, syndicateId, chargeCallId);

  const links = await listSecureLinks(tenantId, {
    scope: CHARGE_CALL_LINK_SCOPE,
    objectType: CHARGE_CALL_OBJECT_TYPE,
    objectId: chargeCallId
  });
  if (links.length === 0) return [];

  const checkouts = await prisma.syndicOnlineCheckout.findMany({
    where: { tenantId, secureLinkId: { in: links.map(link => link.id) } },
    select: { secureLinkId: true, status: true, amount: true, updatedAt: true },
    orderBy: { createdAt: 'desc' }
  });
  // Triés du plus récent au plus ancien : le premier de chaque lien est le dernier.
  const lastByLink = new Map<string, (typeof checkouts)[number]>();
  for (const checkout of checkouts) {
    if (checkout.secureLinkId && !lastByLink.has(checkout.secureLinkId)) {
      lastByLink.set(checkout.secureLinkId, checkout);
    }
  }

  // Jamais de jeton, d'empreinte ni d'URL.
  return links.map(link => {
    const last = lastByLink.get(link.id);
    return {
      id: link.id,
      createdAt: link.createdAt.toISOString(),
      expiresAt: link.expiresAt.toISOString(),
      revokedAt: link.revokedAt ? link.revokedAt.toISOString() : null,
      status: link.status,
      viewCount: link.viewCount,
      lastViewedAt: link.lastViewedAt ? link.lastViewedAt.toISOString() : null,
      createdByUserId: link.createdByUserId,
      payment: last
        ? { status: last.status, amount: Number(last.amount), updatedAt: last.updatedAt.toISOString() }
        : { status: 'NONE', amount: null, updatedAt: null }
    };
  });
}

export async function revokeChargeCallPaymentLink(
  tenantId: string,
  syndicateId: string,
  chargeCallId: string,
  linkId: string,
  actorUserId: string
): Promise<void> {
  await assertChargeCallBelongs(tenantId, syndicateId, chargeCallId);
  // `onObject` : un lien d'un autre appel répond comme un lien inexistant.
  await revokeSecureLink(tenantId, linkId, actorUserId, {
    objectType: CHARGE_CALL_OBJECT_TYPE,
    objectId: chargeCallId
  });
}

// ---------------------------------------------------------------------------
// Côté public
// ---------------------------------------------------------------------------

async function verifyChargeCallLink(token: string): Promise<VerifiedSecureLink> {
  const link = await verifySecureLink(token, CHARGE_CALL_LINK_SCOPE);
  if (link.objectType !== CHARGE_CALL_OBJECT_TYPE) throw invalidSecureLinkError();
  return link;
}

export async function getChargeCallPaymentByToken(
  token: string,
  ctx: { ip?: string; userAgent?: string }
): Promise<ChargeCallPaymentPublicDto> {
  const link = await verifyChargeCallLink(token);

  const dto = await runWithTenantContext({ tenantId: link.tenantId }, async () => {
    const context = await loadChargeCallPaymentContext(link.tenantId, link.objectId);
    if ('failure' in context) return null;
    const { paymentInProgress, reviewPending } = await pendingCheckoutState(link.tenantId, context);
    // Ni nom du copropriétaire, ni coordonnées, ni identifiant technique.
    return {
      syndicateName: context.syndicateName,
      lotLabel: context.lotLabel,
      period: context.period,
      dueDate: context.dueDate.toISOString(),
      amountDue: context.amountDue,
      currency: context.currency,
      expiresAt: link.expiresAt.toISOString(),
      paymentMethods: [...ONLINE_PAYMENT_CHANNELS],
      simulated: context.simulated,
      feesPaidBy: context.feesPaidBy,
      paymentInProgress,
      reviewPending
    } satisfies ChargeCallPaymentPublicDto;
  });
  if (!dto) throw invalidSecureLinkError();

  // Comptabilisée APRÈS une lecture réussie ; un échec de comptage ne bloque pas le payeur.
  try {
    await recordSecureLinkView(link, ctx);
  } catch (error) {
    logger.warn('Secure link view could not be recorded', {
      linkId: link.id,
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
  }
  return dto;
}

/** Statuts HTTP du moteur qui ne doivent rien révéler de plus qu'un lien invalide. */
const REFUSAL_STATUSES = new Set([400, 403, 404]);

export async function startChargeCallPaymentByToken(
  token: string,
  ctx: { ip?: string; userAgent?: string }
): Promise<{ checkoutUrl: string; reused: boolean }> {
  const link = await verifyChargeCallLink(token);

  return runWithTenantContext({ tenantId: link.tenantId }, async () => {
    const context = await loadChargeCallPaymentContext(link.tenantId, link.objectId);
    if ('failure' in context) throw invalidSecureLinkError();

    const linkRow = await prisma.secureLink.findFirst({
      where: { id: link.id, tenantId: link.tenantId },
      select: { createdByUserId: true }
    });
    if (!linkRow) throw invalidSecureLinkError();

    let result;
    try {
      result = await startSyndicCheckout({
        tenantId: link.tenantId,
        syndicateId: context.syndicateId,
        lotId: context.lotId,
        chargeCallIds: [context.chargeCallId],
        origin: 'SECURE_LINK',
        secureLinkId: link.id,
        payerContactId: context.payerContactId,
        actorUserId: linkRow.createdByUserId
      });
    } catch (error) {
      // Un contrôle qui échoue entre la lecture et le démarrage (appel soldé
      // entre-temps, droit retiré…) ne révèle rien de plus qu'un lien invalide.
      // 409 (paiement en cours / en revue) et 502 sont voulus et passent tels quels.
      if (error instanceof AppError && REFUSAL_STATUSES.has(error.statusCode)) throw invalidSecureLinkError();
      throw error;
    }

    const { checkout, reused } = result;
    // Jamais construite à partir d'une entrée de l'appelant : l'URL vient du fournisseur,
    // et elle est revalidée (https, ou http local en simulateur) même en cas de reprise.
    const checkoutUrl = checkout.checkoutUrl ? normalizeProviderCheckoutUrl(checkout.checkoutUrl, context.mode) : null;
    if (!checkoutUrl) {
      logger.error('Charge call payment: provider checkout URL missing or rejected', { checkoutId: checkout.id });
      throw new AppError(
        t("Impossible de créer le paiement en ligne : l'agrégateur n'a pas répondu."),
        502,
        ErrorCode.ONLINE_PAYMENT_PROVIDER_UNREACHABLE
      );
    }

    logAuditEvent({
      actorUserId: null,
      tenantId: link.tenantId,
      actionKey: AuditActionKey.SECURE_LINK_CHARGE_PAYMENT_STARTED,
      entityType: 'SecureLink',
      entityId: link.id,
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      payload: {
        linkId: link.id,
        chargeCallId: context.chargeCallId,
        checkoutId: checkout.id,
        amount: Number(checkout.amount),
        reused
      }
    });

    return { checkoutUrl, reused };
  });
}

/**
 * Statut d'un paiement issu d'un lien, par son code de retour. Seules les
 * tentatives d'origine `SECURE_LINK` d'une agence non suspendue sont lisibles
 * (un code du portail répond comme un code inconnu). Le rapprochement
 * serveur à serveur est limité à une vérification par fenêtre de 10 s.
 */
export async function getChargeCallPaymentStatusByCode(codePaiement: string): Promise<ChargeCallPaymentStatusDto> {
  if (typeof codePaiement !== 'string' || !CODE_PAIEMENT_PATTERN.test(codePaiement)) throw invalidSecureLinkError();

  // Lecture transverse par le code (la page publique n'a pas de contexte d'agence).
  const found = await prisma.syndicOnlineCheckout.findFirst({
    where: {
      codePaiement,
      origin: 'SECURE_LINK',
      secureLinkId: { not: null },
      tenant: { isActive: true, status: { not: 'SUSPENDED' } }
    },
    select: { id: true, tenantId: true }
  });
  if (!found) throw invalidSecureLinkError();

  return runWithTenantContext({ tenantId: found.tenantId }, async () => {
    const row = await prisma.syndicOnlineCheckout.findFirst({ where: { id: found.id, tenantId: found.tenantId } });
    if (!row) throw invalidSecureLinkError();

    // Réservation atomique de la fenêtre + rapprochement ; toute erreur est avalée (état stocké renvoyé).
    const current = await refreshSyndicCheckout(row);

    const [syndicate, call] = await Promise.all([
      prisma.syndicate.findFirst({
        where: { id: current.syndicateId, tenantId: found.tenantId },
        select: { name: true }
      }),
      current.chargeCallIds[0]
        ? prisma.chargeCall.findFirst({
            where: { id: current.chargeCallIds[0], syndicateId: current.syndicateId },
            select: { period: true }
          })
        : Promise.resolve(null)
    ]);

    return {
      status: toPublicStatus(current.status),
      amount: Number(current.amount),
      currency: current.currency,
      syndicateName: syndicate?.name ?? '',
      period: call?.period ?? ''
    };
  });
}

// ---------------------------------------------------------------------------
// Lien joint aux messages (résolveur de `charge-call-payment-url.ts`)
// ---------------------------------------------------------------------------

/**
 * URL du lien « Payer cet appel » à joindre à un avis ou à une relance, ou
 * `null`. Pour exactement UN appel : configuration utilisable + droit SYNDIC +
 * reste dû > 0 + lot non revendu, sinon `null`. Ne lève jamais : toute erreur
 * est journalisée (sans URL ni jeton) et traitée comme « pas de lien ».
 */
export async function createAutomaticChargeCallPaymentUrl(input: {
  tenantId: string;
  syndicateId: string;
  lotId: string;
  chargeCallIds: string[];
}): Promise<string | null> {
  try {
    if (input.chargeCallIds.length !== 1) return null;
    const [chargeCallId] = input.chargeCallIds;
    return await runWithTenantContext({ tenantId: input.tenantId }, async () => {
      const context = await loadChargeCallPaymentContext(input.tenantId, chargeCallId, {
        syndicateId: input.syndicateId,
        lotId: input.lotId
      });
      if ('failure' in context) return null;
      // Le jeton n'est pas stocké : on ne peut pas réutiliser un lien. On révoque les liens
      // AUTOMATIQUES (créés sans gestionnaire) encore actifs de cet appel ; ceux d'un gestionnaire restent.
      await prisma.secureLink.updateMany({
        where: {
          tenantId: input.tenantId,
          scope: CHARGE_CALL_LINK_SCOPE,
          objectType: CHARGE_CALL_OBJECT_TYPE,
          objectId: chargeCallId,
          createdByUserId: null,
          revokedAt: null
        },
        data: { revokedAt: new Date() }
      });
      const link = await createChargeCallPaymentLinkFor(input.tenantId, context, null, {
        ttlDays: env.SECURE_LINK_MAX_TTL_DAYS
      });
      return link.url;
    });
  } catch (error) {
    logger.warn('charge call payment link could not be created', {
      tenantId: input.tenantId,
      chargeCallId: input.chargeCallIds[0],
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
    return null;
  }
}
