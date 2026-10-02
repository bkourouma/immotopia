import { randomBytes } from 'crypto';
import { Prisma, RentalPaymentStatus } from '@prisma/client';
import type { PaymentGatewayConfig } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';
import { t } from '../../i18n';
import { runWithTenantContext } from '../../utils/tenant-context';
import { AppError, BadRequestError, ErrorCode, NotFoundError } from '../../middleware/error-middleware';
import { roundMoney } from '../finance/money';
import { updatePaymentStatusTx, allocatePaymentTx } from '../../services/rental-payment-service';
import { credentialsFrom, ensureCollectionAccountTx, isConfigUsable, loadConfig } from './config';
import { gatewayClientForMode } from './paysecurehub';
import { GatewayError } from './types';
import { operatorFromServiceName } from './status-mapping';
import type { ProviderStatus } from './types';

/**
 * Démarrage et rapprochement des paiements en ligne — contrat §2 et §3.3.
 *
 * `reconcileCheckout*` est la SEULE porte qui change le statut d'un
 * `OnlinePaymentCheckout`. Appelée par l'IPN, le portail, le bouton
 * « Vérifier » de l'agence et la tâche planifiée (`jobs/`).
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** "IMT-" + 20 caractères aléatoires, imprévisible — contrat §1. */
export function generateCodePaiement(): string {
  return `IMT-${randomCode(20)}`;
}

export interface OnlineCheckoutDto {
  id: string;
  codePaiement: string;
  status: string;
  amount: number;
  currency: string;
  installmentIds: string[];
  checkoutUrl: string | null;
  providerServiceName: string | null;
  failureMessage: string | null;
  paymentId: string;
  createdAt: string;
  completedAt: string | null;
}

export interface OnlineCheckoutSummaryDto {
  id: string;
  codePaiement: string;
  status: string;
  mode: string;
  providerServiceName: string | null;
  providerTransactionId: string | null;
  providerFees: number | null;
  failureMessage: string | null;
  reviewReason: string | null;
  lastCheckedAt: string | null;
}

type CheckoutRow = NonNullable<Awaited<ReturnType<typeof prisma.onlinePaymentCheckout.findFirst>>>;

export function toOnlineCheckoutDto(row: CheckoutRow): OnlineCheckoutDto {
  return {
    id: row.id,
    codePaiement: row.codePaiement,
    status: row.status,
    amount: Number(row.amount),
    currency: row.currency,
    installmentIds: row.installmentIds,
    checkoutUrl: row.checkoutUrl,
    providerServiceName: row.providerServiceName,
    failureMessage: row.failureMessage,
    paymentId: row.paymentId,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null
  };
}

export function toOnlineCheckoutSummaryDto(row: CheckoutRow): OnlineCheckoutSummaryDto {
  return {
    id: row.id,
    codePaiement: row.codePaiement,
    status: row.status,
    mode: row.mode,
    providerServiceName: row.providerServiceName,
    providerTransactionId: row.providerTransactionId,
    providerFees: row.providerFees === null ? null : Number(row.providerFees),
    failureMessage: row.failureMessage,
    reviewReason: row.reviewReason,
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null
  };
}

export async function getOnlinePaymentAvailability(
  tenantId: string
): Promise<{ available: boolean; mode: 'SIMULATOR' | 'LIVE' | null; feesPaidBy: 'CLIENT' | 'AGENCY' | null }> {
  const config = await loadConfig(tenantId);
  return {
    available: isConfigUsable(config),
    mode: config?.mode ?? null,
    feesPaidBy: config?.feesPaidBy ?? null
  };
}

/**
 * Nom, téléphone et e-mail du locataire pour `build-away`.
 *
 * Le compte du portail (`TenantClient`/`User`) porte le nom et l'e-mail ; le
 * téléphone vit sur la fiche CRM correspondante (voir
 * `TenantPortalService.resolveCrmContactId`, même rapprochement par e-mail).
 * Une valeur manquante laisse une chaîne vide plutôt que d'échouer : mieux
 * vaut une page PaySecureHub avec un champ vide qu'un paiement bloqué.
 */
async function renterContactInfo(
  tenantId: string,
  tenantClientId: string
): Promise<{ nom: string; prenom: string; telephone: string; email: string }> {
  const client = await prisma.tenantClient.findFirst({
    where: { id: tenantClientId, tenantId },
    select: { user: { select: { fullName: true, email: true } } }
  });

  const fullName = client?.user?.fullName?.trim() || '';
  const [prenom, ...rest] = fullName.split(/\s+/).filter(Boolean);
  const nom = rest.join(' ') || 'Locataire';
  const email = client?.user?.email || '';

  let telephone = '';
  if (email) {
    const contact = await prisma.crmContact.findFirst({
      where: { tenantId, email: { equals: email, mode: 'insensitive' } },
      select: { phonePrimary: true }
    });
    telephone = contact?.phonePrimary || '';
  }

  return { nom, prenom: prenom || '', telephone, email };
}

/** Montant restant dû d'une échéance — même calcul que le portail locataire et le service des échéances. */
export function resteDuEcheance(installment: {
  amount_rent: unknown;
  amount_service: unknown;
  amount_other_fees: unknown;
  penalty_amount: unknown;
  amount_paid: unknown;
  payments: Array<{ amount: unknown; payment: { status: string } | null }>;
}): number {
  const total =
    Number(installment.amount_rent) +
    Number(installment.amount_service) +
    Number(installment.amount_other_fees) +
    Number(installment.penalty_amount || 0);
  const amountPaidFromAlloc = (installment.payments || []).reduce(
    (sum, alloc) => (alloc.payment?.status === RentalPaymentStatus.SUCCESS ? sum + Number(alloc.amount || 0) : sum),
    0
  );
  const amountPaid = Math.max(amountPaidFromAlloc, Number(installment.amount_paid || 0));
  return roundMoney(total - amountPaid);
}

const PENDING_REUSE_WINDOW_MS = 15 * 60 * 1000;

function frontendBase(): string {
  return env.FRONTEND_URL.replace(/\/$/, '');
}

/**
 * URL de retour après le paiement chez l'agrégateur (ou le simulateur).
 * Un checkout issu d'un lien de paiement revient sur la page publique de
 * statut (jamais le jeton du lien, seulement le code de paiement) ; un
 * checkout du portail locataire revient sur le portail.
 */
export function checkoutReturnUrl(checkout: { secureLinkId?: string | null; codePaiement: string }): string {
  const code = encodeURIComponent(checkout.codePaiement);
  return checkout.secureLinkId
    ? `${frontendBase()}/payer/statut?paiement=${code}`
    : `${frontendBase()}/tenant/payments?paiement=${code}`;
}

interface PreparedCheckout {
  config: PaymentGatewayConfig;
  uniqueIds: string[];
  /** Entier, en FCFA. */
  amount: number;
}

/**
 * Contrôles communs au portail et au lien de paiement : configuration
 * utilisable, de 1 à 24 échéances du MÊME tenant ET du bail, non annulées,
 * reste dû > 0. Le montant est toujours recalculé ici, jamais fourni.
 */
async function prepareCheckout(
  tenantId: string,
  leaseId: string,
  installmentIds: string[],
  db: Pick<PrismaTransactionClient, 'rentalInstallment'> = prisma,
  preloadedConfig?: PaymentGatewayConfig | null
): Promise<PreparedCheckout> {
  // `preloadedConfig` : chargée AVANT d'ouvrir une transaction (aucune requête hors `tx` à l'intérieur).
  const config = preloadedConfig === undefined ? await loadConfig(tenantId) : preloadedConfig;
  if (!isConfigUsable(config)) {
    throw new BadRequestError("Le paiement en ligne n'est pas disponible pour cette agence.");
  }

  const uniqueIds = [...new Set(installmentIds)];
  if (uniqueIds.length < 1 || uniqueIds.length > 24) {
    throw new BadRequestError('Sélectionnez de 1 à 24 échéances.');
  }

  const installments = await db.rentalInstallment.findMany({
    where: { id: { in: uniqueIds }, tenant_id: tenantId, lease_id: leaseId },
    select: {
      id: true,
      status: true,
      amount_rent: true,
      amount_service: true,
      amount_other_fees: true,
      penalty_amount: true,
      amount_paid: true,
      payments: { select: { amount: true, payment: { select: { status: true } } } }
    }
  });

  if (installments.length !== uniqueIds.length) {
    throw new BadRequestError('Une échéance sélectionnée est introuvable ou étrangère à ce bail.');
  }

  let amount = 0;
  for (const installment of installments) {
    if (installment.status === 'CANCELED') {
      throw new BadRequestError('Une échéance sélectionnée est annulée.');
    }
    const resteDu = resteDuEcheance(installment);
    if (resteDu <= 0) {
      throw new BadRequestError('Une échéance sélectionnée est déjà soldée.');
    }
    amount += resteDu;
  }
  // PaySecureHub attend un montant entier (FCFA).
  amount = Math.round(roundMoney(amount));

  return { config, uniqueIds, amount };
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * URL de paiement fournie par l'agrégateur, acceptée pour une redirection
 * publique : forme normalisée (`href`) ou `null`. https obligatoire ; http
 * seulement en simulateur ET sur l'hôte local ; pas d'identifiants dans
 * l'URL, ni espace autour. Même esprit que `isSafeCheckoutUrl` côté web.
 */
export function normalizeProviderCheckoutUrl(raw: unknown, mode: 'SIMULATOR' | 'LIVE'): string | null {
  if (typeof raw !== 'string' || raw === '' || raw !== raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === 'https:') return url.href;
  if (url.protocol === 'http:' && mode === 'SIMULATOR' && LOCAL_HOSTS.has(url.hostname)) return url.href;
  return null;
}

interface CheckoutCreationInput {
  tenantId: string;
  leaseId: string;
  renterClientId: string;
  actorUserId: string | null | undefined;
  secureLinkId: string | null;
}

/** Crée le paiement PENDING et son checkout adossé, dans la transaction de l'appelant. */
async function createCheckoutRowsTx(
  tx: PrismaTransactionClient,
  input: CheckoutCreationInput,
  prepared: PreparedCheckout,
  codePaiement: string
) {
  const { tenantId, leaseId, renterClientId, actorUserId, secureLinkId } = input;
  const { config, uniqueIds, amount } = prepared;
  const treasuryAccountId = config.treasuryAccountId ?? (await ensureCollectionAccountTx(tx, tenantId));

  const payment = await tx.rentalPayment.create({
    data: {
      tenant_id: tenantId,
      lease_id: leaseId,
      renter_client_id: renterClientId,
      method: 'MOBILE_MONEY',
      status: 'PENDING',
      currency: 'FCFA',
      amount: new Decimal(amount),
      treasury_account_id: treasuryAccountId,
      psp_name: 'PAYSECUREHUB',
      psp_reference: codePaiement,
      idempotency_key: codePaiement,
      created_by_user_id: actorUserId ?? null
    }
  });

  const checkout = await tx.onlinePaymentCheckout.create({
    data: {
      tenantId,
      paymentId: payment.id,
      leaseId,
      renterClientId,
      provider: 'PAYSECUREHUB',
      mode: config.mode,
      codePaiement,
      amount: new Decimal(amount),
      currency: 'FCFA',
      installmentIds: uniqueIds,
      status: 'PENDING',
      createdByUserId: actorUserId ?? null,
      ...(secureLinkId ? { secureLinkId } : {})
    }
  });

  return { payment, checkout };
}

/**
 * Appel réseau hors transaction (ne pas garder une transaction ouverte le
 * temps d'attendre PaySecureHub) : obtient l'URL de paiement, ou marque le
 * paiement et le checkout FAILED et lève 502.
 */
async function requestProviderCheckout(
  input: CheckoutCreationInput,
  prepared: PreparedCheckout,
  rows: { payment: { id: string }; checkout: { id: string; tenantId: string } },
  codePaiement: string,
  returnUrl: string,
  validateUrl = false
): Promise<OnlineCheckoutDto> {
  const { tenantId, renterClientId } = input;
  const { config, amount } = prepared;
  const { payment, checkout } = rows;
  try {
    const renter = await renterContactInfo(tenantId, renterClientId);
    const client = gatewayClientForMode(config.mode);
    const credentials = credentialsFrom(config);
    const result = await client.buildAway(credentials, {
      codePaiement,
      nomUsager: renter.nom,
      prenomUsager: renter.prenom,
      telephone: renter.telephone,
      email: renter.email,
      libelleArticle: 'Loyer',
      quantite: 1,
      montant: amount,
      libOrder: `Paiement loyer ${codePaiement}`,
      urlRetour: returnUrl,
      urlCallback: `${env.BACKEND_URL.replace(/\/$/, '')}/api/payment-gateway/paysecurehub/ipn`
    });

    // Chemin « lien » : une URL refusée n'est jamais stockée (chemin FAILED + 502 ci-dessous).
    // Le message d'erreur ne contient jamais l'URL.
    let checkoutUrl = result.url;
    if (validateUrl) {
      const safe = normalizeProviderCheckoutUrl(result.url, config.mode);
      if (!safe) throw new Error('Unsafe provider checkout URL');
      checkoutUrl = safe;
    }

    const updated = await prisma.onlinePaymentCheckout.update({
      where: { id: checkout.id, tenantId: checkout.tenantId },
      data: { checkoutUrl, providerToken: result.tokens }
    });
    return toOnlineCheckoutDto(updated);
  } catch (error) {
    await prisma.$transaction([
      prisma.rentalPayment.update({
        where: { id: payment.id, tenant_id: tenantId },
        data: { status: 'FAILED', failed_at: new Date() }
      }),
      prisma.onlinePaymentCheckout.update({
        where: { id: checkout.id, tenantId: checkout.tenantId },
        data: {
          status: 'FAILED',
          failureMessage: error instanceof GatewayError ? error.message : 'Erreur agrégateur.'
        }
      })
    ]);
    logger.warn('startCheckout: build-away a échoué, paiement et checkout marqués FAILED', {
      checkoutId: checkout.id,
      error: (error as Error)?.message
    });
    throw new AppError("Impossible de créer le paiement en ligne : l'agrégateur n'a pas répondu.", 502);
  }
}

/**
 * Démarre un paiement en ligne pour le locataire connecté — contrat §3.3.
 *
 * `leaseId` et `tenantClientId` viennent du contexte du portail
 * (`req.tenantPortal`), jamais du corps de la requête : seul `installmentIds`
 * est fourni par le locataire.
 */
export async function startCheckout(
  tenantId: string,
  tenantClientId: string,
  leaseId: string,
  installmentIds: string[],
  actorUserId: string | undefined
): Promise<OnlineCheckoutDto> {
  const prepared = await prepareCheckout(tenantId, leaseId, installmentIds);
  const { uniqueIds } = prepared;

  const fifteenMinutesAgo = new Date(Date.now() - PENDING_REUSE_WINDOW_MS);
  const overlapping = await prisma.onlinePaymentCheckout.findFirst({
    where: {
      tenantId,
      leaseId,
      status: 'PENDING',
      createdAt: { gte: fifteenMinutesAgo },
      installmentIds: { hasSome: uniqueIds }
    },
    select: { codePaiement: true, checkoutUrl: true }
  });
  if (overlapping) {
    throw new AppError(
      'Un paiement en ligne est déjà en cours pour ces échéances.',
      409,
      ErrorCode.CONFLICT,
      undefined,
      {
        codePaiement: overlapping.codePaiement,
        checkoutUrl: overlapping.checkoutUrl
      }
    );
  }

  const codePaiement = generateCodePaiement();
  const input: CheckoutCreationInput = {
    tenantId,
    leaseId,
    renterClientId: tenantClientId,
    actorUserId,
    secureLinkId: null
  };

  const rows = await prisma.$transaction(tx => createCheckoutRowsTx(tx, input, prepared, codePaiement));
  return requestProviderCheckout(input, prepared, rows, codePaiement, checkoutReturnUrl({ codePaiement }));
}

export interface StartCheckoutForInstallmentsParams {
  tenantId: string;
  leaseId: string;
  renterClientId: string;
  installmentIds: string[];
  actorUserId: string | null;
  secureLinkId: string | null;
  /** Construit l'URL de retour à partir du code de paiement ; par défaut `checkoutReturnUrl`. */
  returnUrl?: (codePaiement: string) => string;
}

export interface StartCheckoutForInstallmentsResult {
  checkout: OnlineCheckoutDto;
  /** `true` si un checkout PENDING récent identique a été repris (même `checkoutUrl`). */
  reused: boolean;
  /** Mode du checkout : l'appelant en déduit les schémas d'URL acceptables (https, http en simulateur). */
  mode: 'SIMULATOR' | 'LIVE';
}

const OVERLAP_MESSAGE = 'Un paiement en ligne est déjà en cours pour cette échéance.';
const REVIEW_MESSAGE = "Votre paiement est en cours de vérification par l'agence. Contactez votre agence.";

/**
 * Variante initiée côté serveur (lien de paiement, agence) : l'appelant n'est
 * pas le locataire connecté. Mêmes contrôles que le portail, plus une
 * politique de chevauchement « REUSE » sous verrou consultatif : deux
 * ouvertures simultanées d'un même lien ne créent qu'un seul checkout.
 */
export async function startCheckoutForInstallments(
  params: StartCheckoutForInstallmentsParams
): Promise<StartCheckoutForInstallmentsResult> {
  const { tenantId, leaseId, renterClientId, installmentIds, actorUserId, secureLinkId } = params;
  const uniqueIds = [...new Set(installmentIds)];
  const input: CheckoutCreationInput = { tenantId, leaseId, renterClientId, actorUserId, secureLinkId };

  // Configuration chargée AVANT la transaction : aucune requête hors `tx` ne
  // doit s'exécuter pendant qu'elle tient une connexion (épuisement du pool).
  const config = await loadConfig(tenantId);
  if (!isConfigUsable(config)) {
    throw new BadRequestError("Le paiement en ligne n'est pas disponible pour cette agence.");
  }

  const codePaiement = generateCodePaiement();
  const lockKey = `${tenantId}:${[...uniqueIds].sort().join(',')}`;

  const outcome = await prisma.$transaction(async tx => {
    // Verrou libéré au COMMIT : sérialise les créations concurrentes pour ces échéances.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    // Ordre de lecture sous verrou : checkouts chevauchants D'ABORD, puis
    // échéances et reste dû. Une réconciliation SUCCESS entre les deux lectures
    // est ainsi vue côté échéance (soldée) et ne laisse pas passer un doublon.
    // PENDING dans la fenêtre de 15 min ; REVIEW sans limite d'âge.
    const since = new Date(Date.now() - PENDING_REUSE_WINDOW_MS);
    const overlapping = await tx.onlinePaymentCheckout.findMany({
      where: {
        tenantId,
        leaseId,
        installmentIds: { hasSome: uniqueIds },
        OR: [{ status: 'PENDING', createdAt: { gte: since } }, { status: 'REVIEW' }]
      },
      select: {
        id: true,
        status: true,
        mode: true,
        secureLinkId: true,
        installmentIds: true,
        amount: true,
        checkoutUrl: true
      }
    });

    const prepared = await prepareCheckout(tenantId, leaseId, uniqueIds, tx, config);
    const { amount } = prepared;

    if (overlapping.length > 0) {
      // Un REVIEW mène toujours au 409 (message dédié), jamais à une reprise.
      if (overlapping.some(row => row.status === 'REVIEW')) {
        throw new AppError(t(REVIEW_MESSAGE), 409, ErrorCode.CONFLICT);
      }
      const sameSet = (ids: string[]) => ids.length === uniqueIds.length && uniqueIds.every(id => ids.includes(id));
      // Reprise : PENDING du chemin « lien », même mode, mêmes échéances, même montant, URL présente.
      const exact = overlapping.find(
        row =>
          row.status === 'PENDING' &&
          row.mode === config.mode &&
          row.secureLinkId != null &&
          sameSet(row.installmentIds) &&
          Math.round(Number(row.amount)) === amount &&
          row.checkoutUrl
      );
      if (overlapping.length === 1 && exact) {
        return { kind: 'reused' as const, id: exact.id, prepared };
      }
      throw new AppError(OVERLAP_MESSAGE, 409, ErrorCode.CONFLICT);
    }

    return {
      kind: 'created' as const,
      prepared,
      rows: await createCheckoutRowsTx(tx, input, prepared, codePaiement)
    };
  });

  if (outcome.kind === 'reused') {
    const existing = await prisma.onlinePaymentCheckout.findFirstOrThrow({ where: { id: outcome.id, tenantId } });
    return { checkout: toOnlineCheckoutDto(existing), reused: true, mode: existing.mode };
  }

  const returnUrl = params.returnUrl
    ? params.returnUrl(codePaiement)
    : checkoutReturnUrl({ secureLinkId, codePaiement });
  const checkout = await requestProviderCheckout(input, outcome.prepared, outcome.rows, codePaiement, returnUrl, true);
  return { checkout, reused: false, mode: outcome.prepared.config.mode };
}

export async function getCheckoutForPayment(tenantId: string, paymentId: string): Promise<CheckoutRow> {
  const checkout = await prisma.onlinePaymentCheckout.findFirst({ where: { tenantId, paymentId } });
  if (!checkout) {
    throw new NotFoundError("Ce paiement n'a pas de paiement en ligne associé.");
  }
  return checkout;
}

export async function getCheckoutForPortal(
  tenantId: string,
  tenantClientId: string,
  codePaiement: string
): Promise<CheckoutRow> {
  const checkout = await prisma.onlinePaymentCheckout.findFirst({
    where: { tenantId, codePaiement, renterClientId: tenantClientId }
  });
  if (!checkout) {
    throw new NotFoundError('Paiement en ligne introuvable.');
  }

  const staleAfter = Date.now() - 10 * 1000;
  if (checkout.status === 'PENDING' && (!checkout.lastCheckedAt || checkout.lastCheckedAt.getTime() < staleAfter)) {
    return reconcileCheckout(tenantId, checkout.id);
  }
  return checkout;
}

/** Cœur du rapprochement — contrat §2. Jamais appelé avec le corps de l'IPN, seulement pour retrouver la référence. */
async function reconcileCheckoutRow(checkout: CheckoutRow): Promise<CheckoutRow> {
  if (checkout.status === 'EXPIRED') {
    // Clos définitivement : la tâche planifiée a déjà fait une dernière vérification avant d'expirer.
    return checkout;
  }

  const config = await loadConfig(checkout.tenantId);
  if (!config) {
    logger.warn('reconcileCheckout: configuration introuvable pour cette agence', { checkoutId: checkout.id });
    return checkout;
  }

  const credentials = credentialsFrom(config);
  const client = gatewayClientForMode(checkout.mode);

  let providerStatus: ProviderStatus;
  try {
    providerStatus = await client.getStatus(credentials, checkout.codePaiement);
  } catch (error) {
    await prisma.onlinePaymentCheckout.update({
      where: { id: checkout.id, tenantId: checkout.tenantId },
      data: { checkAttempts: { increment: 1 }, lastCheckedAt: new Date() }
    });
    logger.warn('reconcileCheckout: agrégateur injoignable', {
      checkoutId: checkout.id,
      error: (error as Error)?.message
    });
    throw error instanceof GatewayError ? new AppError(error.message, 502) : error;
  }

  return applyProviderStatus(checkout, providerStatus);
}

/**
 * Applique la réponse de l'agrégateur au checkout — la machine à états du
 * contrat §2.2 à §2.6. Toute transition qui touche l'argent (succès, échec,
 * annulation) passe par `updatePaymentStatusTx`/`allocatePaymentTx` dans LA
 * MÊME transaction que le changement de statut du checkout.
 */
async function applyProviderStatus(checkout: CheckoutRow, ps: ProviderStatus): Promise<CheckoutRow> {
  const tenantId = checkout.tenantId;

  const bookkeeping: Prisma.OnlinePaymentCheckoutUpdateInput = {
    lastProviderState: ps.rawState,
    lastProviderPayload: ps.raw === null || ps.raw === undefined ? Prisma.JsonNull : (ps.raw as Prisma.InputJsonValue),
    lastCheckedAt: new Date(),
    checkAttempts: { increment: 1 },
    ...(ps.transactionId ? { providerTransactionId: ps.transactionId } : {}),
    ...(ps.serviceName ? { providerServiceName: ps.serviceName } : {}),
    ...(ps.fees !== null ? { providerFees: new Decimal(ps.fees) } : {})
  };

  const target: 'SUCCESS' | 'FAILED' | 'CANCELED' | null = ps.mappedState === 'PENDING' ? null : ps.mappedState;

  if (target === null || checkout.status === target) {
    // En attente, ou conclusion déjà écrite (rejeu idempotent — contrat règle 6).
    return prisma.onlinePaymentCheckout.update({ where: { id: checkout.id, tenantId }, data: bookkeeping });
  }

  if (checkout.status === 'SUCCESS') {
    // Règle 5 : un succès déjà conclu ne redescend jamais — l'état contraire va en REVIEW.
    return prisma.onlinePaymentCheckout.update({
      where: { id: checkout.id, tenantId },
      data: {
        ...bookkeeping,
        status: 'REVIEW',
        reviewReason: `PaySecureHub rapporte maintenant « ${ps.rawState ?? ''} » pour un paiement déjà réussi.`
      }
    });
  }

  if (target === 'SUCCESS') {
    if (ps.amount !== null && Math.round(ps.amount) !== Math.round(Number(checkout.amount))) {
      return prisma.onlinePaymentCheckout.update({
        where: { id: checkout.id, tenantId },
        data: {
          ...bookkeeping,
          status: 'REVIEW',
          reviewReason: `Montant reçu (${ps.amount}) différent du montant attendu (${Number(checkout.amount)}).`
        }
      });
    }

    return prisma.$transaction(async tx => {
      const claim = await tx.onlinePaymentCheckout.updateMany({
        where: { id: checkout.id, tenantId, status: { not: 'SUCCESS' } },
        data: { ...bookkeeping, status: 'SUCCESS', completedAt: new Date() }
      });

      // Un checkout en REVIEW après un succès déjà encaissé (règle 5) revient
      // à SUCCESS sans rejouer l'encaissement : le paiement est déjà SUCCESS
      // et ses affectations sont en place.
      const payment = await tx.rentalPayment.findFirst({
        where: { id: checkout.paymentId, tenant_id: tenantId },
        select: { status: true }
      });

      if (claim.count === 1 && payment?.status !== RentalPaymentStatus.SUCCESS) {
        // Contrat §1 : le moyen réel (Wave, Orange…) et la référence de
        // l'agrégateur sont reportés sur le paiement au succès.
        await tx.rentalPayment.update({
          where: { id: checkout.paymentId, tenant_id: tenantId },
          data: {
            mm_operator: operatorFromServiceName(ps.serviceName),
            ...(ps.transactionId ? { psp_transaction_id: ps.transactionId } : {})
          }
        });
        await updatePaymentStatusTx(tx, tenantId, checkout.paymentId, RentalPaymentStatus.SUCCESS);
        try {
          await allocatePaymentTx(
            tx,
            tenantId,
            checkout.paymentId,
            { installmentIds: checkout.installmentIds },
            checkout.createdByUserId ?? 'system'
          );
        } catch (error) {
          // Rien à allouer (échéances déjà soldées entre-temps) : l'argent
          // reste enregistré en avance sur le compte du locataire, ce qui
          // vaut mieux que d'échouer tout le rapprochement.
          logger.warn('reconcileCheckout: allocation impossible après succès, montant conservé en avance', {
            checkoutId: checkout.id,
            error: (error as Error)?.message
          });
        }
      }

      return tx.onlinePaymentCheckout.findFirstOrThrow({ where: { id: checkout.id, tenantId } });
    });
  }

  // target === 'FAILED' | 'CANCELED'
  return prisma.$transaction(async tx => {
    // Règle 5, suite : un checkout passé en REVIEW alors que son paiement est
    // déjà encaissé ne doit jamais défaire cet encaissement sur un nouvel
    // état contraire — il reste en REVIEW, à trancher par l'agence.
    const payment = await tx.rentalPayment.findFirst({
      where: { id: checkout.paymentId, tenant_id: tenantId },
      select: { status: true }
    });
    if (payment?.status === RentalPaymentStatus.SUCCESS) {
      await tx.onlinePaymentCheckout.updateMany({
        where: { id: checkout.id, tenantId },
        data: {
          ...bookkeeping,
          status: 'REVIEW',
          reviewReason: `PaySecureHub rapporte maintenant « ${ps.rawState ?? ''} » pour un paiement déjà réussi.`
        }
      });
      return tx.onlinePaymentCheckout.findFirstOrThrow({ where: { id: checkout.id, tenantId } });
    }

    const claim = await tx.onlinePaymentCheckout.updateMany({
      where: { id: checkout.id, tenantId, status: { notIn: ['SUCCESS', target] } },
      data: { ...bookkeeping, status: target, failureMessage: ps.error ?? checkout.failureMessage }
    });

    if (claim.count === 1) {
      await updatePaymentStatusTx(
        tx,
        tenantId,
        checkout.paymentId,
        target === 'FAILED' ? RentalPaymentStatus.FAILED : RentalPaymentStatus.CANCELED
      );
    }

    return tx.onlinePaymentCheckout.findFirstOrThrow({ where: { id: checkout.id, tenantId } });
  });
}

export async function reconcileCheckout(tenantId: string, checkoutId: string): Promise<CheckoutRow> {
  const checkout = await prisma.onlinePaymentCheckout.findFirst({ where: { id: checkoutId, tenantId } });
  if (!checkout) {
    throw new NotFoundError('Paiement en ligne introuvable.');
  }
  return reconcileCheckoutRow(checkout);
}

export async function reconcileCheckoutByCode(tenantId: string, codePaiement: string): Promise<CheckoutRow> {
  const checkout = await prisma.onlinePaymentCheckout.findFirst({ where: { tenantId, codePaiement } });
  if (!checkout) {
    throw new NotFoundError('Paiement en ligne introuvable.');
  }
  return reconcileCheckoutRow(checkout);
}

/**
 * IPN — contrat §3.4. Ne connaît pas le tenant : `codePaiement` est notre
 * seule clé. `null` si le code est inconnu ; l'appelant répond alors 200 sans
 * rien révéler, jamais une erreur qui confirmerait ou infirmerait un code.
 */
export async function reconcileCheckoutPublic(codePaiement: string): Promise<CheckoutRow | null> {
  const checkout = await prisma.onlinePaymentCheckout.findFirst({ where: { codePaiement } });
  if (!checkout) return null;
  // Multi-tenant : la seule lecture transverse est celle qui retrouve le code
  // (hors contexte, comme les tâches planifiées — D6). Le rapprochement tourne
  // ensuite dans le contexte de l'agence du checkout, pour que le garde-fou
  // Prisma (utils/prisma-tenant-guard-extension.ts) signale toute requête qui
  // sortirait de cette agence.
  //
  // Une agence suspendue voit quand même ses paiements rapprochés : l'argent a
  // été versé chez l'agrégateur, le taire laisserait un loyer payé en attente.
  // Elle ne peut en revanche plus en démarrer (portail bloqué par
  // `requireTenantPortalAccess`, simulateur fermé par `findSimulatorCheckout`).
  return runWithTenantContext({ tenantId: checkout.tenantId }, () => reconcileCheckoutRow(checkout));
}

/**
 * Checkout du simulateur par son code — page et boutons publics (contrat
 * §3.4). `null` si le code est inconnu, n'est pas en mode simulateur, ou si
 * l'agence est suspendue : le contrôleur répond alors 404 sans distinguer.
 */
export async function findSimulatorCheckout(codePaiement: string): Promise<CheckoutRow | null> {
  return prisma.onlinePaymentCheckout.findFirst({
    where: { codePaiement, mode: 'SIMULATOR', tenant: { status: { not: 'SUSPENDED' } } }
  });
}

/** Enregistre l'issue choisie sur la page du simulateur, dans le contexte de l'agence du checkout. */
export async function recordSimulatedOutcome(
  checkout: CheckoutRow,
  outcome: 'SUCCESS' | 'FAILED' | 'CANCELED'
): Promise<void> {
  await runWithTenantContext({ tenantId: checkout.tenantId }, () =>
    prisma.onlinePaymentCheckout.update({
      where: { id: checkout.id, tenantId: checkout.tenantId },
      data: { simulatedOutcome: outcome }
    })
  );
}

async function expireCheckout(checkout: { id: string; tenantId: string; paymentId: string }): Promise<boolean> {
  return prisma.$transaction(async tx => {
    const claim = await tx.onlinePaymentCheckout.updateMany({
      where: { id: checkout.id, tenantId: checkout.tenantId, status: 'PENDING' },
      data: { status: 'EXPIRED' }
    });
    if (claim.count === 1) {
      await updatePaymentStatusTx(tx, checkout.tenantId, checkout.paymentId, RentalPaymentStatus.CANCELED);
    }
    return claim.count === 1;
  });
}

/**
 * Tâche planifiée — contrat §2.7 et prompt lot 7 : rapproche les checkouts
 * PENDING créés il y a plus de 2 minutes, expire (après cette dernière
 * vérification) ceux de plus de 48 heures.
 */
export async function reconcilePendingCheckouts(): Promise<{ reconciled: number; expired: number; errors: number }> {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const pending = await prisma.onlinePaymentCheckout.findMany({
    where: { status: 'PENDING', createdAt: { lte: twoMinutesAgo } },
    select: { id: true, tenantId: true, paymentId: true, createdAt: true }
  });

  let reconciled = 0;
  let expired = 0;
  let errors = 0;

  for (const row of pending) {
    let stillPending = true;
    try {
      // Lecture transverse ci-dessus hors contexte (D6), traitement de chaque
      // checkout dans le contexte de son agence.
      const result = await runWithTenantContext({ tenantId: row.tenantId }, () =>
        reconcileCheckout(row.tenantId, row.id)
      );
      reconciled++;
      stillPending = result.status === 'PENDING';
    } catch (error) {
      errors++;
      logger.warn('reconcilePendingCheckouts: échec du rapprochement', {
        checkoutId: row.id,
        error: (error as Error)?.message
      });
    }

    if (stillPending && row.createdAt <= fortyEightHoursAgo) {
      try {
        if (await runWithTenantContext({ tenantId: row.tenantId }, () => expireCheckout(row))) expired++;
      } catch (error) {
        errors++;
        logger.warn("reconcilePendingCheckouts: échec de l'expiration", {
          checkoutId: row.id,
          error: (error as Error)?.message
        });
      }
    }
  }

  return { reconciled, expired, errors };
}
