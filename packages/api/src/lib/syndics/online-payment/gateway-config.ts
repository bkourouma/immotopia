import type { SyndicPaymentGatewayConfig } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { env, paymentGatewaySimulatorAvailable } from '../../../config/env';
import { t } from '../../../i18n';
import { AppError, ErrorCode } from '../../../middleware/error-middleware';
import { decryptSecret } from '../../payment-gateway/crypto';
import type { GatewayCredentials } from '../../payment-gateway/types';
import { evaluateSchedulingGate } from '../charge-schedule-tenant-gate';
import type { FeesPaidBy, SyndicOnlineAvailability } from './types';

/**
 * Configuration PaySecureHub PAR COPROPRIÉTÉ (spec 042, R1 à R5).
 *
 * Règle d'étanchéité (R4) : ce fichier ne lit JAMAIS le compte marchand de
 * l'agence. Pas de `loadConfig` ni de `isConfigUsable` de
 * `payment-gateway/config.ts` (un test d'architecture le vérifie) : une
 * copropriété sans configuration active et utilisable est indisponible, même
 * si l'agence a un compte actif. La seule donnée lue du côté agence est
 * `feesPaidBy`, une information d'affichage.
 */

/** Configuration de la copropriété, ou `null` si elle n'en a jamais enregistré. */
export async function loadSyndicGatewayConfig(
  tenantId: string,
  syndicateId: string
): Promise<SyndicPaymentGatewayConfig | null> {
  return prisma.syndicPaymentGatewayConfig.findFirst({ where: { tenantId, syndicateId } });
}

/** Configuration à laquelle une tentative est rattachée (sa clé fait foi pour la vérification). */
export async function loadSyndicGatewayConfigById(
  tenantId: string,
  configId: string
): Promise<SyndicPaymentGatewayConfig | null> {
  return prisma.syndicPaymentGatewayConfig.findFirst({ where: { tenantId, id: configId } });
}

/**
 * Utilisable pour CRÉER un paiement : active et, en `LIVE`, avec identifiant
 * marchand et clé ; le mode `SIMULATOR` n'est utilisable que là où le
 * simulateur est autorisé (jamais en production par défaut).
 */
export function isSyndicConfigUsable(
  config: SyndicPaymentGatewayConfig | null | undefined
): config is SyndicPaymentGatewayConfig {
  if (!config || !config.isActive) return false;
  if (config.mode === 'SIMULATOR') return paymentGatewaySimulatorAvailable;
  return Boolean(config.merchantId && config.apiKeyEncrypted);
}

export function unavailableError(): AppError {
  return new AppError(
    t("Le paiement en ligne n'est pas disponible pour cette copropriété."),
    400,
    ErrorCode.ONLINE_PAYMENT_UNAVAILABLE
  );
}

/** Configuration utilisable, ou 400 `ONLINE_PAYMENT_UNAVAILABLE` : jamais de repli. */
export function assertSyndicConfigUsable(
  config: SyndicPaymentGatewayConfig | null | undefined
): SyndicPaymentGatewayConfig {
  if (!isSyndicConfigUsable(config)) throw unavailableError();
  return config;
}

/**
 * Identifiants prêts pour un `GatewayClient`, avec la clé de LA copropriété.
 * Ne vérifie pas `isActive` : désactiver une configuration n'empêche pas de
 * rapprocher les paiements déjà lancés. Lève 400 si, hors simulateur,
 * l'identifiant ou la clé manquent.
 */
export function syndicCredentialsFrom(config: SyndicPaymentGatewayConfig): GatewayCredentials {
  const apiKey = config.mode === 'SIMULATOR' ? '' : config.apiKeyEncrypted ? decryptSecret(config.apiKeyEncrypted) : '';
  if (config.mode !== 'SIMULATOR' && (!config.merchantId || !apiKey)) throw unavailableError();
  return {
    tenantId: config.tenantId,
    merchantId: config.merchantId ?? '',
    apiKey,
    baseUrl: env.PAYSECUREHUB_BASE_URL,
    timeoutMs: env.PAYSECUREHUB_TIMEOUT_MS
  };
}

/** `feesPaidBy` du compte de l'AGENCE (information affichée au payeur), `CLIENT` sans configuration. */
export async function loadAgencyFeesPaidBy(tenantId: string): Promise<FeesPaidBy> {
  const agency = await prisma.paymentGatewayConfig.findFirst({ where: { tenantId }, select: { feesPaidBy: true } });
  return agency?.feesPaidBy === 'AGENCY' ? 'AGENCY' : 'CLIENT';
}

/**
 * Disponibilité du paiement en ligne de plusieurs copropriétés d'une agence :
 * configuration utilisable ET droit SYNDIC ET agence active. Le droit n'est
 * évalué qu'une fois. Une entrée par identifiant demandé.
 */
export async function getSyndicOnlineAvailabilities(
  tenantId: string,
  syndicateIds: string[]
): Promise<Map<string, SyndicOnlineAvailability>> {
  const ids = Array.from(new Set(syndicateIds));
  const result = new Map<string, SyndicOnlineAvailability>();
  if (ids.length === 0) return result;

  const [configs, feesPaidBy, denial] = await Promise.all([
    prisma.syndicPaymentGatewayConfig.findMany({ where: { tenantId, syndicateId: { in: ids } } }),
    loadAgencyFeesPaidBy(tenantId),
    evaluateSchedulingGate(tenantId, new Date())
  ]);
  const configBySyndicate = new Map(configs.map(config => [config.syndicateId, config]));

  for (const syndicateId of ids) {
    const config = configBySyndicate.get(syndicateId);
    const usable = isSyndicConfigUsable(config);
    const mode = usable ? config.mode : null;
    const unavailableReason = !usable ? 'NOT_CONFIGURED' : denial ? 'SUBSCRIPTION' : null;
    result.set(syndicateId, {
      syndicateId,
      available: unavailableReason === null,
      unavailableReason,
      mode,
      simulated: mode === 'SIMULATOR',
      feesPaidBy
    });
  }
  return result;
}

export async function getSyndicOnlineAvailability(
  tenantId: string,
  syndicateId: string
): Promise<SyndicOnlineAvailability> {
  const all = await getSyndicOnlineAvailabilities(tenantId, [syndicateId]);
  const availability = all.get(syndicateId);
  if (!availability) throw unavailableError();
  return availability;
}
