import type { PaymentGatewayConfig } from '@prisma/client';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { t } from '../../i18n';
import { paymentGatewaySimulatorAvailable } from '../../config/env';
import { AppError, BadRequestError, ErrorCode } from '../../middleware/error-middleware';
import { getEntitlements } from '../../services/subscription-v2-service';
import { evaluateFeatureAccess } from '../subscription/feature-access';
import { isConfigUsable, loadConfig } from './config';
import { isEncryptionAvailable } from './crypto';
import type { RentalOnlineUnavailableReason } from '../rental/online-review/types';

/**
 * Disponibilité du paiement en ligne du LOCATIF (contrat 049 §2.8) : règle unique
 * partagée par le gestionnaire, le portail locataire, le lien public d'échéance,
 * les relances et la création de lien.
 *
 * `usable` = config active ET (mode != SIMULATOR OU simulateur autorisé sur le serveur)
 * ET droit RENTAL de l'agence (agence active + `evaluateFeatureAccess(…, 'RENTAL', true)`,
 * modes `off` / `warn` / `enforce`, comme `lib/syndics/online-payment/feature-gate.ts`).
 *
 * Ne s'applique qu'au DÉMARRAGE et à l'affichage : un paiement déjà versé chez le
 * fournisseur est toujours rapproché, quel que soit l'état de l'abonnement.
 */

export interface RentalOnlineAvailability {
  usable: boolean;
  unavailableReason: RentalOnlineUnavailableReason | null;
  mode: 'SIMULATOR' | 'LIVE' | null;
  simulated: boolean;
  feesPaidBy: 'CLIENT' | 'AGENCY' | null;
  simulatorAvailable: boolean;
  encryptionAvailable: boolean;
  /** Config brute (jamais renvoyée au client) : évite un second chargement à l'appelant. */
  config: PaymentGatewayConfig | null;
}

/** `true` si l'agence est active et a le droit RENTAL (ou si les droits ne s'appliquent pas). */
export async function isRentalFeatureAllowed(tenantId: string, now: Date = new Date()): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true } });
  if (!tenant || tenant.status !== 'ACTIVE') return false;
  let entitlements;
  try {
    entitlements = await getEntitlements(tenantId, { fresh: true, now });
  } catch (error) {
    // Comme le garde de route : une panne du calcul des droits laisse passer (journalisée).
    logger.error('Rental online payment: entitlements unavailable, allowed', {
      tenantId,
      error: error instanceof Error ? error.message : String(error)
    });
    return true;
  }
  if (entitlements.enforcement === 'off') return true;
  const decision = evaluateFeatureAccess(entitlements, 'RENTAL', true);
  if (decision.allowed) return true;
  if (entitlements.enforcement === 'warn') {
    logger.warn('Subscription feature guard (warn): would have refused', {
      tenantId,
      feature: 'RENTAL',
      code: decision.code,
      moduleKey: decision.moduleKey,
      source: 'rental-online-payment'
    });
    return true;
  }
  return false;
}

export async function resolveRentalOnlineAvailability(tenantId: string): Promise<RentalOnlineAvailability> {
  const config = await loadConfig(tenantId);
  const base = {
    mode: config?.mode ?? null,
    simulated: config?.mode === 'SIMULATOR',
    feesPaidBy: config?.feesPaidBy ?? null,
    simulatorAvailable: paymentGatewaySimulatorAvailable,
    encryptionAvailable: isEncryptionAvailable(),
    config
  };
  let reason: RentalOnlineUnavailableReason | null = null;
  if (!config) reason = 'NOT_CONFIGURED';
  else if (!config.isActive) reason = 'INACTIVE';
  else if (config.mode === 'SIMULATOR' && !paymentGatewaySimulatorAvailable) reason = 'SIMULATOR_FORBIDDEN';
  else if (!isConfigUsable(config)) reason = 'NOT_CONFIGURED';
  else if (!(await isRentalFeatureAllowed(tenantId))) reason = 'SUBSCRIPTION';
  return { ...base, usable: reason === null, unavailableReason: reason };
}

/** 403 `RENTAL_FEATURE_DENIED` si l'agence n'a pas le droit RENTAL (agence inactive comprise). */
export async function assertRentalOnlinePaymentAllowed(tenantId: string): Promise<void> {
  if (!(await isRentalFeatureAllowed(tenantId))) {
    throw new AppError(
      t("Le paiement en ligne n'est pas disponible pour cette agence."),
      403,
      ErrorCode.RENTAL_FEATURE_DENIED
    );
  }
}

/**
 * 400 `RENTAL_ONLINE_PAYMENT_UNAVAILABLE`. Reste une `BadRequestError` (le lien public d'échéance
 * transforme toute `BadRequestError` en son refus uniforme) avec le code dédié du contrat.
 */
export function rentalOnlineUnavailableError(): BadRequestError {
  const error = new BadRequestError(t("Le paiement en ligne n'est pas disponible pour cette agence."));
  error.code = ErrorCode.RENTAL_ONLINE_PAYMENT_UNAVAILABLE;
  return error;
}

/** 400 `RENTAL_ONLINE_PAYMENT_UNAVAILABLE` si `usable` est faux (jamais de repli). */
export async function assertRentalOnlinePaymentUsable(tenantId: string): Promise<RentalOnlineAvailability> {
  const availability = await resolveRentalOnlineAvailability(tenantId);
  if (!availability.usable) throw rentalOnlineUnavailableError();
  return availability;
}
