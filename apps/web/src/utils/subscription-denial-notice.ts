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

/**
 * Dépassement de capacité (D4, politique BLOCK) : 409 `QUOTA_EXCEEDED`, avec
 * `data: { capacityKey, used, limit, requested }`. Distinct des trois codes
 * ci-dessus (403, sans `data`) : le message a besoin des chiffres du serveur,
 * donc pas de simple entrée dans `SUBSCRIPTION_DENIAL_CODES`.
 */
export interface QuotaExceededDetail {
  capacityKey: string;
  used: number;
  limit: number;
  requested: number;
  /** Faux quand le pack ne vend aucune extension pour cette capacité (le serveur le dit). */
  extensible?: boolean;
}

export function isQuotaExceededDetail(data: unknown): data is QuotaExceededDetail {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.capacityKey === 'string' && typeof d.used === 'number' && typeof d.limit === 'number';
}

/**
 * L'erreur Axios est-elle un refus de capacité que l'intercepteur ci-dessous
 * annonce déjà ? L'écran appelant s'en sert pour ne pas doubler l'alerte.
 */
export function isQuotaExceededResponse(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { code?: unknown; data?: unknown } } } | null)
    ?.response;
  return (
    response?.status === 409 && response.data?.code === 'QUOTA_EXCEEDED' && isQuotaExceededDetail(response.data.data)
  );
}

/** Libellé pluriel de la capacité, tel qu'il apparaît dans le message. */
const CAPACITY_LABELS: Record<string, string> = {
  LOTS: 'lots',
  COPROPRIETES: 'copropriétés',
  CHANTIERS: 'chantiers',
  BIENS_DETENUS: 'biens détenus'
};

function capacityLabel(capacityKey: string): string {
  return t(CAPACITY_LABELS[capacityKey] ?? capacityKey.toLowerCase());
}

/** Titre et explication d'un refus, traduits. */
export function subscriptionDenialText(code: SubscriptionDenialCode): { title: string; description: string } {
  switch (code) {
    case 'MODULE_NOT_INCLUDED':
      return {
        title: t('Fonction non comprise dans votre abonnement'),
        description: t(
          "Cette fonction relève d'un module que votre agence n'a pas souscrit. Pour l'ajouter, contactez l'administrateur de votre agence ou ImmoTopia."
        )
      };
    case 'MODULE_READ_ONLY':
      return {
        title: t('Module en lecture seule'),
        description: t(
          'Ce module a été retiré de votre abonnement : vous pouvez consulter et exporter ses données, mais plus les modifier.'
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

/**
 * Titre, explication et lien vers le réglage, pour un dépassement de
 * capacité. Le lien est un chemin (pas un composant) : ce fichier reste hors
 * de React pour ne pas peser sur le chunk d'entrée (voir plus bas) — c'est
 * l'appelant (`AppShell`, déjà paresseux) qui construit le bouton depuis
 * `settingsPath`.
 */
export function quotaExceededDenialText(
  detail: QuotaExceededDetail,
  tenantId?: string | null
): { title: string; description: string; settingsPath: string | null } {
  return {
    title: t('Capacité de votre abonnement atteinte'),
    description:
      detail.extensible === false
        ? t(
            'Votre abonnement comprend {{limit}} {{capacite}} et {{used}} sont utilisés. Aucune extension n’est vendue avec votre pack : choisissez la facturation du dépassement, changez de pack ou contactez-nous.',
            { limit: detail.limit, capacite: capacityLabel(detail.capacityKey), used: detail.used }
          )
        : t(
            'Votre abonnement comprend {{limit}} {{capacite}} et {{used}} sont utilisés. Demandez une extension de capacité.',
            { limit: detail.limit, capacite: capacityLabel(detail.capacityKey), used: detail.used }
          ),
    settingsPath: tenantId ? `/tenant/${tenantId}/settings/abonnement` : null
  };
}

/**
 * Barrière « détenu en propre » (pack Patrimoine seul, lot P1) : 403
 * `OWN_ASSETS_ONLY`, avec `data: { action: 'MANDATE' | 'THIRD_PARTY_OWNER' }`.
 * Un seul message, quelle que soit l'action refusée — les deux disent la même
 * chose : l'abonnement Patrimoine ne couvre que les biens détenus en propre.
 */
export type OwnAssetsOnlyAction = 'MANDATE' | 'THIRD_PARTY_OWNER';

export interface OwnAssetsOnlyDetail {
  action: OwnAssetsOnlyAction;
}

export function isOwnAssetsOnlyDetail(data: unknown): data is OwnAssetsOnlyDetail {
  if (!data || typeof data !== 'object') return false;
  const action = (data as Record<string, unknown>).action;
  return action === 'MANDATE' || action === 'THIRD_PARTY_OWNER';
}

/** Titre et explication du refus « détenu en propre », traduits. */
export function ownAssetsOnlyDenialText(): { title: string; description: string } {
  return {
    title: t('Réservé aux biens détenus en propre'),
    description: t(
      'Votre abonnement Patrimoine couvre les biens que vous détenez en propre, gestion locative comprise. La création de mandats et le rattachement de propriétaires tiers relèvent du pack Agence.'
    )
  };
}

export function showOwnAssetsOnlyDenial(notifier: DenialNotifier): void {
  const { title, description } = ownAssetsOnlyDenialText();
  notifier.warning({ key: 'subscription-denial:OWN_ASSETS_ONLY', title, description, duration: 8 });
}

/** Extrait le tenantId d'une URL de requête (`/tenants/:tenantId/...`). */
function tenantIdFromUrl(url: string | undefined): string | null {
  const match = url?.match(/\/tenants\/([^/]+)/);
  return match ? match[1] : null;
}

/** Ce qu'il faut d'une API de notification antd (`App.useApp().notification`). */
export interface DenialNotifier {
  warning: (config: {
    key: string;
    title: string;
    description: string;
    duration: number;
    settingsPath?: string | null;
  }) => void;
}

export function showSubscriptionDenial(notifier: DenialNotifier, code: SubscriptionDenialCode): void {
  const { title, description } = subscriptionDenialText(code);
  notifier.warning({ key: `subscription-denial:${code}`, title, description, duration: 8 });
}

export function showQuotaExceededDenial(
  notifier: DenialNotifier,
  detail: QuotaExceededDetail,
  tenantId?: string | null
): void {
  const { title, description, settingsPath } = quotaExceededDenialText(detail, tenantId);
  notifier.warning({ key: 'subscription-denial:QUOTA_EXCEEDED', title, description, duration: 8, settingsPath });
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
      const body = error.response?.data as { code?: unknown; data?: unknown } | undefined;
      const code = body?.code;
      const status = error.response?.status;
      if (status === 403 && isSubscriptionDenialCode(code)) {
        showSubscriptionDenial(notifier, code);
      } else if (status === 403 && code === 'OWN_ASSETS_ONLY' && isOwnAssetsOnlyDetail(body?.data)) {
        showOwnAssetsOnlyDenial(notifier);
      } else if (status === 409 && code === 'QUOTA_EXCEEDED' && isQuotaExceededDetail(body?.data)) {
        showQuotaExceededDenial(notifier, body.data, tenantIdFromUrl(error.config?.url));
      }
      return Promise.reject(error);
    }
  );
  return () => client.interceptors.response.eject(id);
}
