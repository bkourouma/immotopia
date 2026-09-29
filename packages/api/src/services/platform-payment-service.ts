/**
 * Paiement de l'abonnement des agences (vague 3, lot B) — factures PLATFORM.
 * Reference : docs/architecture/PLAN-ABONNEMENTS.md (§6, D10).
 *
 * Deux chemins coexistent et aboutissent a la MEME porte,
 * `settlePlatformInvoiceTx` :
 *  1. en ligne, sur le compte PaySecureHub d'ImmoTopia (`platform-account.ts`),
 *     en reutilisant le client, le simulateur et la correspondance des statuts
 *     du lot 7 (`lib/payment-gateway`) ;
 *  2. par constat manuel du super-admin (virement, Mobile Money, cheque,
 *     especes), avec justificatif facultatif.
 *
 * Regles reprises du contrat du lot 7 (docs/finance/LOT-7-CONTRAT-PAIEMENT-EN-LIGNE.md §2) :
 * l'IPN n'est jamais crue (on redemande le statut) ; le rapprochement est
 * idempotent ; une facture payee n'est jamais defaite par un statut ulterieur
 * (le checkout passe en REVIEW) ; une agence suspendue voit encore ses
 * paiements rapproches.
 *
 * Une facture payee couvrant la periode echue fait sortir l'abonnement de
 * PAST_DUE (donc de la lecture seule) : meme renouvellement que la tache
 * planifiee (`jobs/subscription-usage-job.ts`, `processBillingBoundary`).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Prisma, PlatformPaymentMethod, SubscriptionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma, PrismaTransactionClient } from '../utils/database';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { runWithTenantContext } from '../utils/tenant-context';
import { getUploadsRoot } from '../utils/project-root';
import { AppError, BadRequestError, ConflictError, ErrorCode, NotFoundError } from '../middleware/error-middleware';
import { logAuditEvent } from './audit-service';
import { AuditActionKey } from '../types/audit-types';
import { addBillingPeriod } from '../lib/subscription';
import { applyDueItemTransitionsTx, invalidateEntitlements } from './subscription-v2-service';
import { applyUpgradeForInvoiceTx } from './subscription-upgrade/apply-upgrade';
import { UPGRADE_AUDIT, UPGRADE_SOURCE_PACK, UpgradeTarget } from './subscription-upgrade/constants';
import { gatewayClientForMode } from '../lib/payment-gateway/paysecurehub';
import { GatewayError, type ProviderStatus } from '../lib/payment-gateway/types';
import { generatePlatformCodePaiement } from '../lib/payment-gateway/codes';
import {
  isPlatformGatewayAvailable,
  platformCredentials,
  platformGatewayMode,
  platformIpnUrl,
  platformReturnUrl
} from '../lib/payment-gateway/platform-account';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Un checkout PENDING plus recent bloque un nouveau depart (409 avec reprise). */
const RESUME_WINDOW_MS = 15 * 60 * 1000;
/** Au-dela, la tache planifiee l'expire apres une derniere verification. */
const EXPIRE_AFTER_MS = 48 * 60 * 60 * 1000;

/** Statuts d'une facture PLATFORM qui attendent un reglement. */
export const PAYABLE_INVOICE_STATUSES = ['ISSUED', 'OVERDUE', 'FAILED'] as const;

const MANUAL_METHODS: readonly PlatformPaymentMethod[] = ['BANK_TRANSFER', 'MOBILE_MONEY', 'CHECK', 'CASH'];

const toNumber = (value: unknown): number => (value === null || value === undefined ? 0 : Number(String(value)));

// =============================================================== DTO

type CheckoutRow = Prisma.PlatformPaymentCheckoutGetPayload<Record<string, never>>;
type PaymentRow = Prisma.PlatformInvoicePaymentGetPayload<Record<string, never>>;

export interface PlatformCheckoutDto {
  id: string;
  invoiceId: string;
  codePaiement: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED' | 'EXPIRED' | 'REVIEW';
  mode: 'SIMULATOR' | 'LIVE';
  amount: number;
  currency: string;
  checkoutUrl: string | null;
  providerServiceName: string | null;
  failureMessage: string | null;
  reviewReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export function toPlatformCheckoutDto(row: CheckoutRow): PlatformCheckoutDto {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    codePaiement: row.codePaiement,
    status: row.status,
    mode: row.mode,
    amount: toNumber(row.amount),
    currency: row.currency,
    checkoutUrl: row.checkoutUrl,
    providerServiceName: row.providerServiceName,
    failureMessage: row.failureMessage,
    reviewReason: row.reviewReason,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null
  };
}

export interface PlatformInvoicePaymentDto {
  id: string;
  invoiceId: string;
  method: PlatformPaymentMethod;
  amount: number;
  currency: string;
  paidAt: string;
  reference: string | null;
  note: string | null;
  hasProof: boolean;
  proofName: string | null;
  checkoutId: string | null;
  recordedByUserId: string | null;
  createdAt: string;
}

export function toPaymentDto(row: PaymentRow): PlatformInvoicePaymentDto {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    method: row.method,
    amount: toNumber(row.amount),
    currency: row.currency,
    paidAt: row.paidAt.toISOString(),
    reference: row.reference,
    note: row.note,
    hasProof: Boolean(row.proofPath),
    proofName: row.proofName,
    checkoutId: row.checkoutId,
    recordedByUserId: row.recordedByUserId,
    createdAt: row.createdAt.toISOString()
  };
}

export interface PlatformPaymentAvailability {
  available: boolean;
  mode: 'SIMULATOR' | 'LIVE';
}

export function getPlatformPaymentAvailability(): PlatformPaymentAvailability {
  const mode = platformGatewayMode();
  return { available: isPlatformGatewayAvailable(mode), mode };
}

// =============================================================== reglement (porte unique)

export interface SettleInput {
  tenantId: string;
  invoiceId: string;
  method: PlatformPaymentMethod;
  paidAt: Date;
  amount?: number;
  reference?: string | null;
  note?: string | null;
  proof?: { path: string; name: string; mimeType: string } | null;
  checkoutId?: string | null;
  actorUserId?: string | null;
  now?: Date;
}

export interface SettleResult {
  /** Faux : la facture etait deja reglee (rejeu ou double paiement). */
  created: boolean;
  payment: PaymentRow | null;
  /**
   * RENEWED : l'abonnement est sorti de PAST_DUE / la periode a avance.
   * UPGRADED : facture d'upgrade d'un espace particulier, abonnement passe
   * au palier payant (lot 4D).
   */
  subscription: 'NONE' | 'RENEWED' | 'UPGRADED';
  /** Cible du palier appliquee (facture d'upgrade seulement), pour l'audit apres commit. */
  upgradeApplied?: UpgradeTarget;
}

/**
 * Marque une facture PLATFORM payee et en tire les consequences sur
 * l'abonnement. Idempotent : une facture deja reglee n'est jamais reecrite
 * (`created: false`). A appeler dans une transaction.
 */
export async function settlePlatformInvoiceTx(tx: PrismaTransactionClient, input: SettleInput): Promise<SettleResult> {
  const { tenantId, invoiceId } = input;
  // Verrou de ligne : deux reglements concurrents (IPN et constat) se suivent.
  await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} AND tenant_id = ${tenantId} FOR UPDATE`;

  const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, tenantId, kind: 'PLATFORM' } });
  if (!invoice) throw new NotFoundError('Facture introuvable.');
  if (invoice.billingNature === 'CREDIT_NOTE') throw new BadRequestError('Un avoir ne se règle pas.');

  const existing = await tx.platformInvoicePayment.findFirst({ where: { invoiceId, tenantId } });
  if (existing || invoice.status === 'PAID') {
    return { created: false, payment: existing, subscription: 'NONE' };
  }
  if (!(PAYABLE_INVOICE_STATUSES as readonly string[]).includes(invoice.status)) {
    throw new BadRequestError("Cette facture n'est pas en attente de règlement.");
  }

  const amount = input.amount ?? toNumber(invoice.amountTotal);
  const payment = await tx.platformInvoicePayment.create({
    data: {
      tenantId,
      invoiceId,
      method: input.method,
      amount: new Decimal(amount),
      currency: invoice.currency,
      paidAt: input.paidAt,
      reference: input.reference ?? null,
      note: input.note ?? null,
      proofPath: input.proof?.path ?? null,
      proofName: input.proof?.name ?? null,
      proofMimeType: input.proof?.mimeType ?? null,
      checkoutId: input.checkoutId ?? null,
      recordedByUserId: input.actorUserId ?? null
    }
  });

  await tx.invoice.update({
    where: { id: invoiceId, tenantId },
    data: {
      status: 'PAID',
      paidAt: input.paidAt,
      paymentMethod: input.method,
      paymentReference: input.reference ?? null
    }
  });

  const now = input.now ?? new Date();
  // Facture d'upgrade (lot 4D) : le reglement fait passer l'abonnement gratuit
  // au palier payant, dans cette transaction ; le renouvellement de periode
  // ci-dessous ne s'applique alors pas (la periode repart du paiement).
  const upgrade = await applyUpgradeForInvoiceTx(tx, {
    tenantId,
    invoiceId,
    actorUserId: input.actorUserId ?? null,
    now
  });
  if (upgrade.target !== null) {
    return upgrade.applied
      ? { created: true, payment, subscription: 'UPGRADED', upgradeApplied: upgrade.target }
      : { created: true, payment, subscription: 'NONE' };
  }
  const subscription = await applyPaymentToSubscriptionTx(tx, tenantId, invoice, now);
  return { created: true, payment, subscription };
}

/**
 * Renouvellement au paiement. Meme regle que `processBillingBoundary` : une
 * facture payee dont la periode commence a l'echeance (a un jour pres) fait
 * avancer la periode et repasse l'abonnement ACTIVE (`pastDueAt` efface :
 * fin de la grace et de la lecture seule). Une facture sans periode (saisie
 * manuelle ancienne) regle aussi l'echeance d'un abonnement PAST_DUE.
 * Hors echeance atteinte, rien : la tache planifiee renouvellera a l'echeance
 * en trouvant la facture payee.
 */
async function applyPaymentToSubscriptionTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  invoice: { subscriptionId: string | null; periodStart: Date | null },
  now: Date
): Promise<'NONE' | 'RENEWED'> {
  const sub = await tx.subscription.findUnique({ where: { tenantId } });
  if (!sub) return 'NONE';
  if (invoice.subscriptionId && invoice.subscriptionId !== sub.id) return 'NONE';

  const live: SubscriptionStatus[] = [
    SubscriptionStatus.TRIALING,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.PAST_DUE
  ];
  if (!live.includes(sub.status)) return 'NONE';

  const boundary =
    sub.status === SubscriptionStatus.PAST_DUE
      ? (sub.pastDueAt ?? sub.currentPeriodEnd)
      : sub.status === SubscriptionStatus.TRIALING
        ? (sub.trialEndsAt ?? sub.currentPeriodEnd)
        : sub.currentPeriodEnd;

  if (sub.status !== SubscriptionStatus.PAST_DUE && boundary.getTime() > now.getTime()) return 'NONE';

  const nextEnd = addBillingPeriod(boundary, sub.billingCycle);
  const covers =
    invoice.periodStart === null
      ? sub.status === SubscriptionStatus.PAST_DUE
      : invoice.periodStart.getTime() >= boundary.getTime() - DAY_MS &&
        invoice.periodStart.getTime() < nextEnd.getTime();
  if (!covers) return 'NONE';

  await applyDueItemTransitionsTx(tx, tenantId, now);
  await tx.subscription.update({
    where: { id: sub.id, tenantId },
    data: {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: boundary,
      currentPeriodEnd: nextEnd,
      nextBillingAt: nextEnd,
      pastDueAt: null
    }
  });
  return 'RENEWED';
}

function auditSettlement(
  tenantId: string,
  invoiceId: string,
  result: SettleResult,
  actorUserId: string | null,
  extra: Record<string, unknown>
) {
  if (!result.created || !result.payment) return;
  invalidateEntitlements(tenantId);
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.INVOICE_MARKED_PAID,
    entityType: 'Invoice',
    entityId: invoiceId,
    payload: {
      method: result.payment.method,
      amount: toNumber(result.payment.amount),
      paidAt: result.payment.paidAt.toISOString(),
      reference: result.payment.reference,
      subscription: result.subscription,
      ...extra
    }
  });
  if (result.upgradeApplied) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: UPGRADE_AUDIT.APPLIED,
      entityType: 'Invoice',
      entityId: invoiceId,
      payload: { invoiceId, from: UPGRADE_SOURCE_PACK, to: result.upgradeApplied, source: extra.source ?? null }
    });
  }
}

// =============================================================== constat manuel (super-admin)

export interface ManualPaymentInput {
  method: PlatformPaymentMethod;
  paidAt: Date;
  reference?: string | null;
  note?: string | null;
  proof?: { buffer: Buffer; originalName: string; mimeType: string } | null;
}

function proofExtension(mimeType: string, originalName: string): string {
  const byMime: Record<string, string> = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/tiff': '.tif'
  };
  if (byMime[mimeType]) return byMime[mimeType];
  const ext = path.extname(originalName).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

/** Dossier PRIVE des justificatifs : jamais classe public par uploads-access-middleware (refus par defaut). */
function proofRelativeDir(tenantId: string): string {
  return path.posix.join('platform', 'invoice-payments', tenantId);
}

/** Constat manuel du super-admin : facture de l'agence `tenantId` marquee payee. */
export async function recordManualPayment(
  tenantId: string,
  invoiceId: string,
  input: ManualPaymentInput,
  actorUserId: string
): Promise<{ payment: PlatformInvoicePaymentDto; subscription: 'NONE' | 'RENEWED' | 'UPGRADED' }> {
  if (!MANUAL_METHODS.includes(input.method)) {
    throw new BadRequestError('Mode de règlement invalide pour un constat manuel.');
  }
  if (Number.isNaN(input.paidAt.getTime()) || input.paidAt.getTime() > Date.now() + DAY_MS) {
    throw new BadRequestError('La date de paiement ne peut pas être dans le futur.');
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId, kind: 'PLATFORM' },
    select: { id: true, status: true }
  });
  if (!invoice) throw new NotFoundError('Facture introuvable.');
  if (invoice.status === 'PAID') throw new ConflictError('Cette facture est déjà réglée.');

  let proof: SettleInput['proof'] = null;
  let absoluteProof: string | null = null;
  if (input.proof) {
    const relative = path.posix.join(
      proofRelativeDir(tenantId),
      `${randomUUID()}${proofExtension(input.proof.mimeType, input.proof.originalName)}`
    );
    absoluteProof = path.join(getUploadsRoot(env.UPLOADS_DIR), ...relative.split('/'));
    await fs.mkdir(path.dirname(absoluteProof), { recursive: true });
    await fs.writeFile(absoluteProof, input.proof.buffer);
    proof = {
      path: relative,
      name: path.basename(input.proof.originalName).slice(0, 200),
      mimeType: input.proof.mimeType
    };
  }

  let result: SettleResult;
  try {
    result = await prisma.$transaction(tx =>
      settlePlatformInvoiceTx(tx, {
        tenantId,
        invoiceId,
        method: input.method,
        paidAt: input.paidAt,
        reference: input.reference?.trim() || null,
        note: input.note?.trim() || null,
        proof,
        actorUserId
      })
    );
  } catch (error) {
    if (absoluteProof) await fs.unlink(absoluteProof).catch(() => undefined);
    throw error;
  }

  if (!result.created || !result.payment) {
    if (absoluteProof) await fs.unlink(absoluteProof).catch(() => undefined);
    throw new ConflictError('Cette facture est déjà réglée.');
  }

  auditSettlement(tenantId, invoiceId, result, actorUserId, { source: 'MANUAL', hasProof: Boolean(proof) });
  return { payment: toPaymentDto(result.payment), subscription: result.subscription };
}

/** Reglement d'une facture (ou `null`), vu par le super-admin ou l'agence. */
export async function getInvoicePayment(
  tenantId: string,
  invoiceId: string
): Promise<PlatformInvoicePaymentDto | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId, kind: 'PLATFORM' },
    select: { id: true }
  });
  if (!invoice) throw new NotFoundError('Facture introuvable.');
  const payment = await prisma.platformInvoicePayment.findFirst({ where: { invoiceId, tenantId } });
  return payment ? toPaymentDto(payment) : null;
}

/** Justificatif prive : chemin absolu verifie sous la racine des depots. */
export async function getInvoicePaymentProof(
  tenantId: string,
  invoiceId: string
): Promise<{ absolutePath: string; name: string; mimeType: string }> {
  const payment = await prisma.platformInvoicePayment.findFirst({ where: { invoiceId, tenantId } });
  if (!payment?.proofPath) throw new NotFoundError('Justificatif introuvable.');
  const root = getUploadsRoot(env.UPLOADS_DIR);
  const absolutePath = path.resolve(root, ...payment.proofPath.split('/'));
  if (!absolutePath.startsWith(path.resolve(root) + path.sep)) throw new NotFoundError('Justificatif introuvable.');
  return {
    absolutePath,
    name: payment.proofName || path.basename(absolutePath),
    mimeType: payment.proofMimeType || 'application/octet-stream'
  };
}

/** Facture de l'agence, pour lire `tenantId` depuis une route plateforme `/admin/invoices/:invoiceId`. */
export async function resolvePlatformInvoiceTenant(invoiceId: string): Promise<string> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, kind: 'PLATFORM' },
    select: { tenantId: true }
  });
  if (!invoice) throw new NotFoundError('Facture introuvable.');
  return invoice.tenantId;
}

// =============================================================== paiement en ligne (agence)

/**
 * Demarre le paiement en ligne d'une facture PLATFORM de l'agence.
 * 409 (avec `data.codePaiement` et `data.checkoutUrl` pour reprendre) si un
 * paiement de moins de 15 minutes est deja en cours pour cette facture.
 */
export async function startInvoiceCheckout(
  tenantId: string,
  invoiceId: string,
  actorUserId: string | null
): Promise<PlatformCheckoutDto> {
  const mode = platformGatewayMode();
  if (!isPlatformGatewayAvailable(mode)) {
    throw new BadRequestError("Le paiement en ligne de l'abonnement n'est pas disponible.");
  }

  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId, kind: 'PLATFORM' } });
  if (!invoice) throw new NotFoundError('Facture introuvable.');
  if (invoice.billingNature === 'CREDIT_NOTE') throw new BadRequestError('Un avoir ne se règle pas.');
  if (invoice.status === 'PAID') throw new ConflictError('Cette facture est déjà réglée.');
  if (!(PAYABLE_INVOICE_STATUSES as readonly string[]).includes(invoice.status)) {
    throw new BadRequestError("Cette facture n'est pas en attente de règlement.");
  }
  // PaySecureHub attend un montant entier (FCFA).
  const amount = Math.round(toNumber(invoice.amountTotal));
  if (amount <= 0) throw new BadRequestError("Cette facture n'a rien à régler.");

  const pending = await prisma.platformPaymentCheckout.findFirst({
    where: { tenantId, invoiceId, status: 'PENDING', createdAt: { gte: new Date(Date.now() - RESUME_WINDOW_MS) } },
    orderBy: { createdAt: 'desc' },
    select: { codePaiement: true, checkoutUrl: true }
  });
  if (pending) {
    throw new AppError(
      'Un paiement en ligne est déjà en cours pour cette facture.',
      409,
      ErrorCode.CONFLICT,
      undefined,
      {
        codePaiement: pending.codePaiement,
        checkoutUrl: pending.checkoutUrl
      }
    );
  }

  const codePaiement = generatePlatformCodePaiement();
  const checkout = await prisma.platformPaymentCheckout.create({
    data: {
      tenantId,
      invoiceId,
      provider: 'PAYSECUREHUB',
      mode,
      codePaiement,
      amount: new Decimal(amount),
      currency: invoice.currency,
      status: 'PENDING',
      createdByUserId: actorUserId
    }
  });

  // Appel reseau hors transaction.
  try {
    const [tenant, user] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, contactEmail: true, contactPhone: true }
      }),
      actorUserId
        ? prisma.user.findUnique({ where: { id: actorUserId }, select: { fullName: true, email: true } })
        : Promise.resolve(null)
    ]);
    const [prenom, ...rest] = (user?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
    const result = await gatewayClientForMode(mode).buildAway(platformCredentials(tenantId, mode), {
      codePaiement,
      nomUsager: rest.join(' ') || tenant?.name || 'Agence',
      prenomUsager: prenom || '',
      telephone: tenant?.contactPhone || '',
      email: user?.email || tenant?.contactEmail || '',
      libelleArticle: 'Abonnement ImmoTopia',
      quantite: 1,
      montant: amount,
      libOrder: `Facture ${invoice.invoiceNumber}`,
      urlRetour: platformReturnUrl(tenantId, codePaiement),
      urlCallback: platformIpnUrl()
    });
    const updated = await prisma.platformPaymentCheckout.update({
      where: { id: checkout.id, tenantId: checkout.tenantId },
      data: { checkoutUrl: result.url, providerToken: result.tokens }
    });
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.PLATFORM_PAYMENT_STARTED,
      entityType: 'Invoice',
      entityId: invoiceId,
      payload: { codePaiement, mode, amount }
    });
    return toPlatformCheckoutDto(updated);
  } catch (error) {
    await prisma.platformPaymentCheckout.update({
      where: { id: checkout.id, tenantId: checkout.tenantId },
      data: { status: 'FAILED', failureMessage: error instanceof GatewayError ? error.message : 'Erreur agrégateur.' }
    });
    logger.warn('startInvoiceCheckout: build-away a échoué, checkout marqué FAILED', {
      checkoutId: checkout.id,
      error: (error as Error)?.message
    });
    if (error instanceof AppError) throw error;
    throw new AppError("Impossible de créer le paiement en ligne : l'agrégateur n'a pas répondu.", 502);
  }
}

/** Checkout d'une facture par son code, pour le retour de paiement ; rapproche s'il est en attente depuis plus de 10 s. */
export async function getInvoiceCheckoutForTenant(
  tenantId: string,
  codePaiement: string
): Promise<PlatformCheckoutDto> {
  const checkout = await prisma.platformPaymentCheckout.findFirst({ where: { tenantId, codePaiement } });
  if (!checkout) throw new NotFoundError('Paiement en ligne introuvable.');
  const stale = Date.now() - 10 * 1000;
  if (checkout.status === 'PENDING' && (!checkout.lastCheckedAt || checkout.lastCheckedAt.getTime() < stale)) {
    try {
      return toPlatformCheckoutDto(await reconcilePlatformCheckoutRow(checkout));
    } catch (error) {
      logger.warn('getInvoiceCheckoutForTenant: rapprochement en échec', { error: (error as Error)?.message });
    }
  }
  return toPlatformCheckoutDto(checkout);
}

/** Derniers checkouts d'une facture (plus recent d'abord). */
export async function listInvoiceCheckouts(tenantId: string, invoiceId: string): Promise<PlatformCheckoutDto[]> {
  const rows = await prisma.platformPaymentCheckout.findMany({
    where: { tenantId, invoiceId },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  return rows.map(toPlatformCheckoutDto);
}

// =============================================================== rapprochement

async function reconcilePlatformCheckoutRow(checkout: CheckoutRow): Promise<CheckoutRow> {
  if (checkout.status === 'EXPIRED') return checkout;

  let providerStatus: ProviderStatus;
  try {
    providerStatus = await gatewayClientForMode(checkout.mode).getStatus(
      platformCredentials(checkout.tenantId, checkout.mode),
      checkout.codePaiement
    );
  } catch (error) {
    await prisma.platformPaymentCheckout.update({
      where: { id: checkout.id, tenantId: checkout.tenantId },
      data: { checkAttempts: { increment: 1 }, lastCheckedAt: new Date() }
    });
    throw error instanceof GatewayError ? new AppError(error.message, 502) : error;
  }
  return applyPlatformProviderStatus(checkout, providerStatus);
}

/** Machine a etats du contrat du lot 7 (§2.2 a §2.6), appliquee a une facture PLATFORM. */
export async function applyPlatformProviderStatus(checkout: CheckoutRow, ps: ProviderStatus): Promise<CheckoutRow> {
  const { tenantId } = checkout;
  const bookkeeping = {
    lastProviderState: ps.rawState,
    lastProviderPayload: ps.raw === null || ps.raw === undefined ? Prisma.JsonNull : (ps.raw as Prisma.InputJsonValue),
    lastCheckedAt: new Date(),
    checkAttempts: { increment: 1 },
    ...(ps.transactionId ? { providerTransactionId: ps.transactionId } : {}),
    ...(ps.serviceName ? { providerServiceName: ps.serviceName } : {}),
    ...(ps.fees !== null ? { providerFees: new Decimal(ps.fees) } : {})
  };
  const target = ps.mappedState === 'PENDING' ? null : ps.mappedState;
  const reviewContrary = `PaySecureHub rapporte maintenant « ${ps.rawState ?? ''} » pour un paiement déjà réussi.`;

  if (target === null || checkout.status === target) {
    return prisma.platformPaymentCheckout.update({
      where: { id: checkout.id, tenantId: checkout.tenantId },
      data: bookkeeping
    });
  }

  if (checkout.status === 'SUCCESS') {
    // Regle 5 : un succes ne redescend jamais ; la facture reste payee.
    return prisma.platformPaymentCheckout.update({
      where: { id: checkout.id, tenantId: checkout.tenantId },
      data: { ...bookkeeping, status: 'REVIEW', reviewReason: reviewContrary }
    });
  }

  if (target === 'SUCCESS') {
    if (ps.amount !== null && Math.round(ps.amount) !== Math.round(toNumber(checkout.amount))) {
      return prisma.platformPaymentCheckout.update({
        where: { id: checkout.id, tenantId: checkout.tenantId },
        data: {
          ...bookkeeping,
          status: 'REVIEW',
          reviewReason: `Montant reçu (${ps.amount}) différent du montant attendu (${toNumber(checkout.amount)}).`
        }
      });
    }

    const { row, settled } = await prisma.$transaction(async tx => {
      const claim = await tx.platformPaymentCheckout.updateMany({
        where: { id: checkout.id, tenantId, status: { not: 'SUCCESS' } },
        data: { ...bookkeeping, status: 'SUCCESS', completedAt: new Date() }
      });
      let settledResult: SettleResult | null = null;
      if (claim.count === 1) {
        const already = await tx.platformInvoicePayment.findFirst({
          where: { invoiceId: checkout.invoiceId, tenantId },
          select: { checkoutId: true }
        });
        if (already && already.checkoutId !== checkout.id) {
          // Facture deja reglee par ailleurs (constat manuel ou autre checkout) :
          // argent recu deux fois, a trancher par le super-admin.
          await tx.platformPaymentCheckout.update({
            where: { id: checkout.id, tenantId: checkout.tenantId },
            data: {
              status: 'REVIEW',
              reviewReason: 'Facture déjà réglée par un autre paiement : double encaissement à vérifier.'
            }
          });
        } else if (!already) {
          const invoice = await tx.invoice.findFirst({
            where: { id: checkout.invoiceId, tenantId },
            select: { status: true }
          });
          if (invoice && (PAYABLE_INVOICE_STATUSES as readonly string[]).includes(invoice.status)) {
            settledResult = await settlePlatformInvoiceTx(tx, {
              tenantId,
              invoiceId: checkout.invoiceId,
              method: 'ONLINE',
              paidAt: new Date(),
              amount: toNumber(checkout.amount),
              reference: ps.transactionId ?? checkout.codePaiement,
              checkoutId: checkout.id,
              actorUserId: checkout.createdByUserId
            });
          } else {
            await tx.platformPaymentCheckout.update({
              where: { id: checkout.id, tenantId: checkout.tenantId },
              data: {
                status: 'REVIEW',
                reviewReason: `Paiement reçu pour une facture au statut ${invoice?.status ?? 'inconnu'} : à vérifier.`
              }
            });
          }
        }
      }
      return {
        row: await tx.platformPaymentCheckout.findFirstOrThrow({ where: { id: checkout.id, tenantId } }),
        settled: settledResult
      };
    });
    if (settled) {
      auditSettlement(tenantId, checkout.invoiceId, settled, checkout.createdByUserId, {
        source: 'ONLINE',
        codePaiement: checkout.codePaiement,
        mode: checkout.mode
      });
    }
    return row;
  }

  // FAILED | CANCELED
  return prisma.$transaction(async tx => {
    const paidByThis = await tx.platformInvoicePayment.findFirst({
      where: { invoiceId: checkout.invoiceId, tenantId, checkoutId: checkout.id },
      select: { id: true }
    });
    if (paidByThis) {
      // Regle 5, suite : la facture reglee par ce checkout n'est jamais defaite.
      await tx.platformPaymentCheckout.update({
        where: { id: checkout.id, tenantId: checkout.tenantId },
        data: { ...bookkeeping, status: 'REVIEW', reviewReason: reviewContrary }
      });
    } else {
      await tx.platformPaymentCheckout.updateMany({
        where: { id: checkout.id, tenantId, status: { notIn: ['SUCCESS', target] } },
        data: { ...bookkeeping, status: target, failureMessage: ps.error ?? checkout.failureMessage }
      });
    }
    return tx.platformPaymentCheckout.findFirstOrThrow({ where: { id: checkout.id, tenantId } });
  });
}

export async function reconcilePlatformCheckout(tenantId: string, checkoutId: string): Promise<CheckoutRow> {
  const checkout = await prisma.platformPaymentCheckout.findFirst({ where: { id: checkoutId, tenantId } });
  if (!checkout) throw new NotFoundError('Paiement en ligne introuvable.');
  return reconcilePlatformCheckoutRow(checkout);
}

/**
 * IPN du compte ImmoTopia et page du simulateur : seule lecture transverse
 * (par code), puis rapprochement dans le contexte de l'agence qui paie.
 * `null` si le code est inconnu (l'appelant ne revele rien).
 */
export async function reconcilePlatformCheckoutPublic(codePaiement: string): Promise<CheckoutRow | null> {
  const checkout = await prisma.platformPaymentCheckout.findFirst({ where: { codePaiement } });
  if (!checkout) return null;
  return runWithTenantContext({ tenantId: checkout.tenantId }, () => reconcilePlatformCheckoutRow(checkout));
}

/** Checkout simulateur d'une facture PLATFORM ; `null` si inconnu, reel, ou agence suspendue. */
export async function findPlatformSimulatorCheckout(codePaiement: string): Promise<CheckoutRow | null> {
  const checkout = await prisma.platformPaymentCheckout.findFirst({ where: { codePaiement, mode: 'SIMULATOR' } });
  if (!checkout) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: checkout.tenantId }, select: { status: true } });
  return tenant && tenant.status !== 'SUSPENDED' ? checkout : null;
}

export async function recordPlatformSimulatedOutcome(
  checkout: CheckoutRow,
  outcome: 'SUCCESS' | 'FAILED' | 'CANCELED'
): Promise<void> {
  await runWithTenantContext({ tenantId: checkout.tenantId }, () =>
    prisma.platformPaymentCheckout.update({
      where: { id: checkout.id, tenantId: checkout.tenantId },
      data: { simulatedOutcome: outcome }
    })
  );
}

/**
 * Tache planifiee (`jobs/online-payment-reconciliation-job.ts`) : rapproche les
 * checkouts PENDING de plus de 2 minutes, expire ceux de plus de 48 heures
 * apres une derniere verification.
 */
export async function reconcilePendingPlatformCheckouts(
  now: Date = new Date()
): Promise<{ reconciled: number; expired: number; errors: number }> {
  const pending = await prisma.platformPaymentCheckout.findMany({
    where: { status: 'PENDING', createdAt: { lte: new Date(now.getTime() - 2 * 60 * 1000) } },
    select: { id: true, tenantId: true, createdAt: true }
  });
  let reconciled = 0;
  let expired = 0;
  let errors = 0;
  for (const row of pending) {
    let stillPending = true;
    try {
      // eslint-disable-next-line no-await-in-loop -- sequentiel, peu de lignes.
      const result = await runWithTenantContext({ tenantId: row.tenantId }, () =>
        reconcilePlatformCheckout(row.tenantId, row.id)
      );
      reconciled++;
      stillPending = result.status === 'PENDING';
    } catch (error) {
      errors++;
      logger.warn('reconcilePendingPlatformCheckouts: échec du rapprochement', {
        checkoutId: row.id,
        error: (error as Error)?.message
      });
    }
    if (stillPending && row.createdAt.getTime() <= now.getTime() - EXPIRE_AFTER_MS) {
      // eslint-disable-next-line no-await-in-loop
      const claim = await runWithTenantContext({ tenantId: row.tenantId }, () =>
        prisma.platformPaymentCheckout.updateMany({
          where: { id: row.id, tenantId: row.tenantId, status: 'PENDING' },
          data: { status: 'EXPIRED' }
        })
      );
      if (claim.count === 1) expired++;
    }
  }
  return { reconciled, expired, errors };
}
