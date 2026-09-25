import { notification } from 'antd';
import { t } from '../i18n/t';

/**
 * Refus d'abonnement, dit clairement (vague 2 des abonnements).
 *
 * Chargé à la demande par `api-client.ts` sur un 403 dont le `code` est l'un
 * des trois ci-dessous : un tel refus est rare, antd `notification` n'a rien à
 * faire dans le chunk d'entrée (même raison que `tenant-suspended-detection`).
 *
 * L'écran qui a lancé la requête affiche aussi, en général, le message du
 * serveur ; celui-ci dit en plus QUOI FAIRE. Une clé par code : dix requêtes
 * refusées d'un coup ne font qu'une notification.
 */

export const SUBSCRIPTION_DENIAL_CODES = ['MODULE_NOT_INCLUDED', 'MODULE_READ_ONLY', 'SUBSCRIPTION_READ_ONLY'] as const;
export type SubscriptionDenialCode = (typeof SUBSCRIPTION_DENIAL_CODES)[number];

export function isSubscriptionDenialCode(code: unknown): code is SubscriptionDenialCode {
  return typeof code === 'string' && (SUBSCRIPTION_DENIAL_CODES as readonly string[]).includes(code);
}

/** Titre et explication d'un refus, traduits. */
export function subscriptionDenialText(code: SubscriptionDenialCode): { title: string; description: string } {
  switch (code) {
    case 'MODULE_NOT_INCLUDED':
      return {
        title: t("Fonction non comprise dans votre abonnement"),
        description: t(
          "Cette fonction relève d'un module que votre agence n'a pas souscrit. Pour l'ajouter, contactez l'administrateur de votre agence ou ImmoTopia."
        )
      };
    case 'MODULE_READ_ONLY':
      return {
        title: t('Module en lecture seule'),
        description: t(
          "Ce module a été retiré de votre abonnement : vous pouvez consulter et exporter ses données, mais plus les modifier."
        )
      };
    case 'SUBSCRIPTION_READ_ONLY':
      return {
        title: t('Abonnement en lecture seule'),
        description: t(
          "L'abonnement de votre agence n'est plus actif : les données restent consultables, les modifications sont suspendues jusqu'à sa régularisation."
        )
      };
  }
}

export function showSubscriptionDenial(code: SubscriptionDenialCode): void {
  const { title, description } = subscriptionDenialText(code);
  notification.warning({ key: `subscription-denial:${code}`, message: title, description, duration: 8 });
}
