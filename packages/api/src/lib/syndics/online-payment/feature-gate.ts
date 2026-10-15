import { t } from '../../../i18n';
import { AppError, ErrorCode } from '../../../middleware/error-middleware';
import { evaluateSchedulingGate } from '../charge-schedule-tenant-gate';

/**
 * Droit SYNDIC de l'agence pour le paiement en ligne (spec 042, R9).
 *
 * Le portail copropriétaire et le lien sécurisé ne passent ni par
 * `requireTenantAccess` ni par `subscriptionRouteGuard` : la décision est donc
 * reprise ici, avec les mêmes fonctions que la tâche des appels automatiques
 * (agence active, `evaluateFeatureAccess(…, 'SYNDIC', true)`, modes
 * `off`/`warn`/`enforce`). Elle ne s'applique qu'au DÉMARRAGE et à la
 * disponibilité : un paiement déjà versé chez le fournisseur est toujours
 * rapproché, quel que soit l'état de l'abonnement.
 */

/** `true` si l'agence peut proposer le paiement en ligne. Ne lève jamais pour un refus. */
export async function isSyndicOnlinePaymentAllowed(tenantId: string, now: Date = new Date()): Promise<boolean> {
  return (await evaluateSchedulingGate(tenantId, now)) === null;
}

/** 403 `SYNDIC_FEATURE_DENIED` si l'agence n'a pas le droit (agence inactive comprise). */
export async function assertSyndicOnlinePaymentAllowed(tenantId: string, now: Date = new Date()): Promise<void> {
  if (!(await isSyndicOnlinePaymentAllowed(tenantId, now))) {
    throw new AppError(
      t("Le paiement en ligne n'est pas disponible pour cette agence."),
      403,
      ErrorCode.SYNDIC_FEATURE_DENIED
    );
  }
}
