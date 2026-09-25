import type { AxiosError, AxiosInstance } from 'axios';
import { t } from '../i18n/t';

/**
 * Refus d'abonnement, dit clairement (vague 2 des abonnements).
 *
 * Intercepteur de réponse de `apiClient` (utils/api-client.ts) qui traduit un
 * 403 MODULE_NOT_INCLUDED / MODULE_READ_ONLY / SUBSCRIPTION_READ_ONLY en
 * notification antd, textes via t(). Il est INSTALLÉ sur l'instance
 * centrale par la coquille (`<AppShell>`, chunk paresseux) et non déclaré
 * dans api-client.ts : le chunk d'entrée n'a plus de marge (budget §8.1),
 * et même un intercepteur de dix lignes le faisait déborder. Toutes les
 * requêtes de l'application passent par cette instance : l'effet est le même.
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

/** Ce qu'il faut d'une API de notification antd (`App.useApp().notification`). */
export interface DenialNotifier {
  warning: (config: { key: string; title: string; description: string; duration: number }) => void;
}

export function showSubscriptionDenial(notifier: DenialNotifier, code: SubscriptionDenialCode): void {
  const { title, description } = subscriptionDenialText(code);
  notifier.warning({ key: `subscription-denial:${code}`, title, description, duration: 8 });
}

/**
 * Pose l'intercepteur sur l'instance centrale ; renvoie de quoi le retirer.
 * `notifier` : l'API contextualisée d'antd (thème, langue, sens RTL), jamais
 * la fonction statique `notification`, qui tirerait son code dans le chunk
 * d'entrée.
 */
export function installSubscriptionDenialInterceptor(client: AxiosInstance, notifier: DenialNotifier): () => void {
  const id = client.interceptors.response.use(
    response => response,
    (error: AxiosError) => {
      const code = (error.response?.data as { code?: unknown } | undefined)?.code;
      if (error.response?.status === 403 && isSubscriptionDenialCode(code)) showSubscriptionDenial(notifier, code);
      return Promise.reject(error);
    }
  );
  return () => client.interceptors.response.eject(id);
}
