import type { NotificationChannelKey, NotificationStatusKey } from '../../services/notifications-service';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

/** Libellé d'un canal d'envoi. */
export function channelLabel(channel: NotificationChannelKey): string {
  switch (channel) {
    case 'IN_APP':
      return t("Dans l'application");
    case 'EMAIL':
      return t('E-mail');
    case 'WHATSAPP':
      return t('WhatsApp');
    case 'SMS':
      return t('SMS');
    default:
      return channel;
  }
}

/** Libellé d'un statut d'envoi (la lecture n'est pas un statut : voir `readAt`). */
export function statusLabel(status: NotificationStatusKey): string {
  switch (status) {
    case 'PENDING':
      return t('En attente');
    case 'SENT':
      return t('Envoyée');
    case 'DELIVERED':
      return t('Remise');
    case 'FAILED':
      return t('Échec');
    case 'SKIPPED':
      return t('Non envoyée');
    default:
      return status;
  }
}

/** Couleur de pastille Ant Design d'un statut d'envoi. */
export function statusColor(status: NotificationStatusKey): string {
  switch (status) {
    case 'DELIVERED':
      return 'green';
    case 'SENT':
      return 'blue';
    case 'FAILED':
      return 'red';
    case 'PENDING':
      return 'gold';
    default:
      return 'default';
  }
}

/** Date et heure courtes dans la langue active ; `—` si absente. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(activeLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Chemin interne sûr pour la navigation : seulement `/chemin` (jamais `//hôte`, `javascript:` ni URL absolue).
 * Un lien absolu vers l'origine de l'application est ramené à son chemin.
 */
export function safeInternalLink(link: string | null | undefined): string | null {
  if (!link) return null;
  // Caractère de contrôle ou espace : rejet net (pas de nettoyage silencieux).
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F\s]/.test(link)) return null;
  let path = link;
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (url.origin !== window.location.origin) return null;
      path = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }
  return /^\/(?![/\\])[^\s]*$/.test(path) ? path : null;
}
