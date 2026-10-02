import { prisma } from '../../utils/database';
import { t } from '../../i18n';
import { logger } from '../../utils/logger';
import { runWithTenantContext } from '../../utils/tenant-context';
import { AppError, BadRequestError, NotFoundError } from '../../middleware/error-middleware';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { roundMoney } from '../finance/money';
import { computeInstallmentStatus } from '../finance/installment-status';
import {
  createSecureLink,
  invalidSecureLinkError,
  listSecureLinks,
  recordSecureLinkView,
  revokeSecureLink,
  verifySecureLink
} from '../secure-links';
import type { CreatedSecureLink, VerifiedSecureLink } from '../secure-links';
import { isConfigUsable, loadConfig } from './config';
import {
  normalizeProviderCheckoutUrl,
  reconcileCheckout,
  resteDuEcheance,
  startCheckoutForInstallments
} from './checkout';

/**
 * Lien de paiement Mobile Money d'un loyer (lot C5, spec 039).
 *
 * Un lien = une échéance (`SecureLink` de portée INSTALLMENT_PAYMENT,
 * `objectType = 'RentalInstallment'`). Le MONTANT n'est jamais dans le lien ni
 * lu de l'appelant : il est recalculé ici (`resteDuEcheance`, pénalités
 * comprises) à chaque ouverture et à chaque démarrage. Côté public, seul le
 * jeton (ou le code de paiement) entre : tout le reste vient de la base, dans
 * l'agence du lien. Tout refus public est la même `invalidSecureLinkError()`.
 */

export const INSTALLMENT_OBJECT_TYPE = 'RentalInstallment';

export type InstallmentPaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
export type InstallmentPaymentMethod = 'WAVE' | 'ORANGE_MONEY' | 'MTN_MONEY' | 'MOOV_MONEY';

export interface InstallmentLinkContext {
  installmentId: string;
  leaseId: string;
  periodYear: number;
  periodMonth: number;
  dueDate: Date;
  amountDue: number;
  currency: string;
  renterClientId: string;
  agencyName: string;
}

export interface InstallmentPaymentLinkSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  viewCount: number;
  lastViewedAt: string | null;
  createdByUserId: string | null;
  payment: {
    status: 'NONE' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED' | 'EXPIRED' | 'REVIEW';
    amount: number | null;
    updatedAt: string | null;
  };
}

export interface InstallmentPaymentPublicDto {
  agencyName: string;
  periodYear: number;
  periodMonth: number;
  dueDate: string;
  amountDue: number;
  currency: string;
  expiresAt: string;
  paymentMethods: InstallmentPaymentMethod[];
  simulated: boolean;
  /** Un paiement PENDING récent existe pour l'échéance. */
  paymentInProgress: boolean;
  /** Un paiement REVIEW (vérification par l'agence) existe pour l'échéance. */
  reviewPending: boolean;
}

export interface InstallmentPaymentStatusDto {
  status: InstallmentPaymentStatus;
  amount: number;
  currency: string;
  agencyName: string;
  periodYear: number;
  periodMonth: number;
}

const PAYMENT_METHODS: InstallmentPaymentMethod[] = ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'];
const PENDING_WINDOW_MS = 15 * 60 * 1000;
const STATUS_STALE_MS = 10 * 1000;
const CODE_PAIEMENT_PATTERN = /^IMT-[A-Za-z0-9]{20}$/;

type ContextFailure = 'NOT_FOUND' | 'LEASE_NOT_ACTIVE' | 'CANCELED' | 'SETTLED' | 'NOT_ISSUED' | 'ONLINE_UNAVAILABLE';

/**
 * Lit l'échéance (par id ET agence) et vérifie tout ce qui la rend payable :
 * bail actif, échéance non annulée, reste dû > 0, compte marchand utilisable.
 * Ne lève pas : l'appelant choisit le refus (404 uniforme public, 404/400 agence).
 */
async function loadInstallmentContext(
  tenantId: string,
  installmentId: string
): Promise<{ context: InstallmentLinkContext; mode: 'SIMULATOR' | 'LIVE' } | { failure: ContextFailure }> {
  const installment = await prisma.rentalInstallment.findFirst({
    where: { id: installmentId, tenant_id: tenantId },
    select: {
      id: true,
      lease_id: true,
      period_year: true,
      period_month: true,
      due_date: true,
      status: true,
      currency: true,
      amount_rent: true,
      amount_service: true,
      amount_other_fees: true,
      penalty_amount: true,
      amount_paid: true,
      payments: { select: { amount: true, payment: { select: { status: true } } } },
      lease: { select: { status: true, primary_renter_client_id: true } },
      tenant: { select: { name: true } }
    }
  });
  if (!installment) return { failure: 'NOT_FOUND' };
  if (!installment.lease || installment.lease.status !== 'ACTIVE') return { failure: 'LEASE_NOT_ACTIVE' };
  if (installment.status === 'CANCELED') return { failure: 'CANCELED' };
  // Spec 039 : un lien ne porte que sur une échéance exigible (DUE, OVERDUE ou
  // PARTIAL). Statut calculé comme la liste : un brouillon dont la date est passée
  // est « En retard » ; un brouillon à venir n'est pas encore émis (BUG-2026-10-02-015).
  if (computeInstallmentStatus(installment, new Date(), { emitDraft: false }) === 'DRAFT') {
    return { failure: 'NOT_ISSUED' };
  }

  const amountDue = Math.round(roundMoney(resteDuEcheance(installment)));
  if (amountDue <= 0) return { failure: 'SETTLED' };

  const config = await loadConfig(tenantId);
  if (!isConfigUsable(config)) return { failure: 'ONLINE_UNAVAILABLE' };

  return {
    mode: config.mode,
    context: {
      installmentId: installment.id,
      leaseId: installment.lease_id,
      periodYear: installment.period_year,
      periodMonth: installment.period_month,
      dueDate: installment.due_date,
      amountDue,
      currency: 'FCFA',
      renterClientId: installment.lease.primary_renter_client_id,
      agencyName: installment.tenant?.name ?? ''
    }
  };
}

function failureToError(failure: ContextFailure): Error {
  switch (failure) {
    case 'NOT_FOUND':
      return new NotFoundError(t('Échéance introuvable.'));
    case 'LEASE_NOT_ACTIVE':
      return new BadRequestError(t("Le bail de cette échéance n'est pas actif."));
    case 'CANCELED':
      return new BadRequestError(t('Cette échéance est annulée.'));
    case 'SETTLED':
      return new BadRequestError(t('Cette échéance est déjà soldée.'));
    case 'NOT_ISSUED':
      return new BadRequestError(
        t("Cette échéance est encore à l'état de brouillon : émettez-la avant d'envoyer un lien de paiement.")
      );
    case 'ONLINE_UNAVAILABLE':
      return new BadRequestError(t("Le paiement en ligne n'est pas disponible pour cette agence."));
  }
}

async function pendingCheckoutState(
  tenantId: string,
  leaseId: string,
  installmentId: string
): Promise<{ paymentInProgress: boolean; reviewPending: boolean }> {
  // PENDING dans la fenêtre de 15 min ; REVIEW (à trancher par l'agence) sans limite d'âge.
  const rows = await prisma.onlinePaymentCheckout.findMany({
    where: {
      tenantId,
      leaseId,
      installmentIds: { has: installmentId },
      OR: [{ status: 'PENDING', createdAt: { gte: new Date(Date.now() - PENDING_WINDOW_MS) } }, { status: 'REVIEW' }]
    },
    select: { status: true }
  });
  return {
    paymentInProgress: rows.some(row => row.status === 'PENDING'),
    reviewPending: rows.some(row => row.status === 'REVIEW')
  };
}

/** URL du fournisseur acceptée pour la redirection publique, sinon 502 générique (jamais l'URL dans un journal). */
function safeProviderUrlOrThrow(rawUrl: string, mode: 'SIMULATOR' | 'LIVE'): string {
  const safe = normalizeProviderCheckoutUrl(rawUrl, mode);
  if (!safe) {
    logger.error('Installment payment: provider checkout URL rejected', { mode });
    throw new AppError("Impossible de créer le paiement en ligne : l'agrégateur n'a pas répondu.", 502);
  }
  return safe;
}

// ---------------------------------------------------------------------------
// Côté agence
// ---------------------------------------------------------------------------

export async function createInstallmentPaymentLink(
  tenantId: string,
  installmentId: string,
  actorUserId: string | null,
  opts?: { ttlDays?: number }
): Promise<{ link: CreatedSecureLink; context: InstallmentLinkContext }> {
  const loaded = await loadInstallmentContext(tenantId, installmentId);
  if ('failure' in loaded) throw failureToError(loaded.failure);

  const link = await createSecureLink({
    tenantId,
    scope: 'INSTALLMENT_PAYMENT',
    objectType: INSTALLMENT_OBJECT_TYPE,
    objectId: installmentId,
    createdByUserId: actorUserId,
    ttlDays: opts?.ttlDays
  });
  return { link, context: loaded.context };
}

async function assertInstallmentBelongsToTenant(tenantId: string, installmentId: string): Promise<void> {
  const installment = await prisma.rentalInstallment.findFirst({
    where: { id: installmentId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!installment) throw new NotFoundError(t('Échéance introuvable.'));
}

export async function listInstallmentPaymentLinks(
  tenantId: string,
  installmentId: string
): Promise<InstallmentPaymentLinkSummary[]> {
  await assertInstallmentBelongsToTenant(tenantId, installmentId);

  const links = await listSecureLinks(tenantId, {
    scope: 'INSTALLMENT_PAYMENT',
    objectType: INSTALLMENT_OBJECT_TYPE,
    objectId: installmentId
  });
  if (links.length === 0) return [];

  const checkouts = await prisma.onlinePaymentCheckout.findMany({
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

export async function revokeInstallmentPaymentLink(
  tenantId: string,
  installmentId: string,
  linkId: string,
  actorUserId: string
): Promise<void> {
  await assertInstallmentBelongsToTenant(tenantId, installmentId);
  // `onObject` : un lien d'une autre échéance répond comme un lien inexistant.
  await revokeSecureLink(tenantId, linkId, actorUserId, {
    objectType: INSTALLMENT_OBJECT_TYPE,
    objectId: installmentId
  });
}

// ---------------------------------------------------------------------------
// Côté public
// ---------------------------------------------------------------------------

async function verifyInstallmentLink(token: string): Promise<VerifiedSecureLink> {
  const link = await verifySecureLink(token, 'INSTALLMENT_PAYMENT');
  if (link.objectType !== INSTALLMENT_OBJECT_TYPE) throw invalidSecureLinkError();
  return link;
}

export async function getInstallmentPaymentByToken(
  token: string,
  ctx: { ip?: string; userAgent?: string }
): Promise<InstallmentPaymentPublicDto> {
  const link = await verifyInstallmentLink(token);

  const dto = await runWithTenantContext({ tenantId: link.tenantId }, async () => {
    const loaded = await loadInstallmentContext(link.tenantId, link.objectId);
    if ('failure' in loaded) return null;
    const { context, mode } = loaded;
    const { paymentInProgress, reviewPending } = await pendingCheckoutState(
      link.tenantId,
      context.leaseId,
      context.installmentId
    );
    // Aucune coordonnée, aucun identifiant technique, pas le nom du locataire.
    return {
      agencyName: context.agencyName,
      periodYear: context.periodYear,
      periodMonth: context.periodMonth,
      dueDate: context.dueDate.toISOString(),
      amountDue: context.amountDue,
      currency: context.currency,
      expiresAt: link.expiresAt.toISOString(),
      paymentMethods: [...PAYMENT_METHODS],
      simulated: mode === 'SIMULATOR',
      paymentInProgress,
      reviewPending
    } satisfies InstallmentPaymentPublicDto;
  });
  if (!dto) throw invalidSecureLinkError();

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

export async function startInstallmentPaymentByToken(
  token: string,
  ctx: { ip?: string; userAgent?: string }
): Promise<{ checkoutUrl: string; reused: boolean }> {
  const link = await verifyInstallmentLink(token);

  return runWithTenantContext({ tenantId: link.tenantId }, async () => {
    const loaded = await loadInstallmentContext(link.tenantId, link.objectId);
    if ('failure' in loaded) throw invalidSecureLinkError();
    const { context } = loaded;

    const linkRow = await prisma.secureLink.findFirst({
      where: { id: link.id, tenantId: link.tenantId },
      select: { createdByUserId: true }
    });
    if (!linkRow) throw invalidSecureLinkError();

    let result;
    try {
      result = await startCheckoutForInstallments({
        tenantId: link.tenantId,
        leaseId: context.leaseId,
        renterClientId: context.renterClientId,
        installmentIds: [context.installmentId],
        actorUserId: linkRow.createdByUserId,
        secureLinkId: link.id
      });
    } catch (error) {
      // Un contrôle qui échoue entre la lecture et le démarrage (échéance soldée
      // entre-temps…) ne doit rien révéler de plus qu'un lien invalide.
      if (error instanceof BadRequestError) throw invalidSecureLinkError();
      throw error;
    }

    const { checkout, reused, mode } = result;
    // Jamais construite à partir d'une entrée de l'appelant : l'URL vient du fournisseur.
    if (!checkout.checkoutUrl) throw invalidSecureLinkError();
    const checkoutUrl = safeProviderUrlOrThrow(checkout.checkoutUrl, mode);

    logAuditEvent({
      actorUserId: null,
      tenantId: link.tenantId,
      actionKey: AuditActionKey.SECURE_LINK_PAYMENT_STARTED,
      entityType: 'SecureLink',
      entityId: link.id,
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      payload: {
        linkId: link.id,
        installmentId: context.installmentId,
        checkoutId: checkout.id,
        amount: checkout.amount,
        reused
      }
    });

    return { checkoutUrl, reused };
  });
}

function toPublicStatus(status: string): InstallmentPaymentStatus {
  switch (status) {
    case 'SUCCESS':
      return 'SUCCESS';
    case 'FAILED':
      return 'FAILED';
    case 'CANCELED':
    case 'EXPIRED':
      return 'CANCELED';
    default:
      // PENDING, et REVIEW (à trancher par l'agence : le locataire voit « en cours »).
      return 'PENDING';
  }
}

export async function getInstallmentPaymentStatusByCode(codePaiement: string): Promise<InstallmentPaymentStatusDto> {
  if (typeof codePaiement !== 'string' || !CODE_PAIEMENT_PATTERN.test(codePaiement)) throw invalidSecureLinkError();

  // Lecture transverse par le code (la page publique n'a pas de contexte
  // d'agence) : seuls les checkouts issus d'un lien, d'une agence non suspendue.
  const found = await prisma.onlinePaymentCheckout.findFirst({
    where: {
      codePaiement,
      secureLinkId: { not: null },
      tenant: { isActive: true, status: { not: 'SUSPENDED' } }
    },
    select: { id: true, tenantId: true }
  });
  if (!found) throw invalidSecureLinkError();

  return runWithTenantContext({ tenantId: found.tenantId }, async () => {
    const row = await prisma.onlinePaymentCheckout.findFirst({
      where: { id: found.id, tenantId: found.tenantId },
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        installmentIds: true,
        lastCheckedAt: true,
        tenant: { select: { name: true } }
      }
    });
    if (!row) throw invalidSecureLinkError();

    let status: string = row.status;
    if (row.status === 'PENDING') {
      // Réservation atomique : une seule requête concurrente réconcilie par
      // fenêtre de 10 s (`reconcileCheckout` ne court-circuite pas sur lastCheckedAt).
      const claim = await prisma.onlinePaymentCheckout.updateMany({
        where: {
          id: row.id,
          tenantId: found.tenantId,
          status: 'PENDING',
          OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - STATUS_STALE_MS) } }]
        },
        data: { lastCheckedAt: new Date() }
      });
      if (claim.count === 1) {
        try {
          // Serveur à serveur : le statut vient de l'agrégateur, jamais de la requête.
          status = (await reconcileCheckout(found.tenantId, row.id)).status;
        } catch (error) {
          // Fournisseur injoignable : on renvoie l'état stocké.
          logger.warn('Installment payment status: reconciliation failed', {
            checkoutId: row.id,
            errorName: error instanceof Error ? error.name : 'UnknownError'
          });
        }
      }
    }

    const installment = row.installmentIds[0]
      ? await prisma.rentalInstallment.findFirst({
          where: { id: row.installmentIds[0], tenant_id: found.tenantId },
          select: { period_year: true, period_month: true }
        })
      : null;
    if (!installment) throw invalidSecureLinkError();

    return {
      status: toPublicStatus(status),
      amount: Number(row.amount),
      currency: row.currency,
      agencyName: row.tenant?.name ?? '',
      periodYear: installment.period_year,
      periodMonth: installment.period_month
    };
  });
}
