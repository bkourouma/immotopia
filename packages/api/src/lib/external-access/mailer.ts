import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../constants/email-notification-default-templates';
import { t } from '../../i18n';
import { emailService } from '../../services/email-service';
import { getEmailNotificationConfig } from '../../services/email-notification-config-service';
import { logger } from '../../utils/logger';
import { applyTemplate, escapeHtml } from '../patrimoine/notification-channels';
import type { ExternalAccessTypeKey } from './sections';

/**
 * Envoi du lien d'un accès tiers par e-mail (clé `EXTERNAL_ACCESS_LINK_SENT`).
 *
 * Le destinataire est un tiers SANS fiche CRM : pas de contrôle de
 * consentement CRM, l'envoi est une action explicite de l'agence. L'URL (donc
 * le jeton) va dans le corps, jamais dans le sujet ; elle n'est ni journalisée
 * ni renvoyée par ce module. Ne lève jamais : un échec d'envoi n'annule pas la
 * création du lien, que l'agence peut encore remettre elle-même.
 */

export type ExternalAccessEmailResult = {
  sent: boolean;
  reason?: 'NOT_REQUESTED' | 'EVENT_DISABLED' | 'SEND_FAILED';
};

export const NOT_REQUESTED: ExternalAccessEmailResult = { sent: false, reason: 'NOT_REQUESTED' };

export function externalAccessTypeLabel(type: ExternalAccessTypeKey): string {
  switch (type) {
    case 'NOTARY':
      return t('Notaire');
    case 'ACCOUNTANT':
      return t('Expert-comptable');
    case 'BANKER':
      return t('Banquier');
  }
}

export async function sendExternalAccessLinkEmail(args: {
  tenantId: string;
  agencyName: string;
  recipientName: string;
  recipientEmail: string;
  type: ExternalAccessTypeKey;
  accessUrl: string;
  linkExpiresAt: Date;
}): Promise<ExternalAccessEmailResult> {
  const key = 'EXTERNAL_ACCESS_LINK_SENT' as const;
  try {
    const config = await getEmailNotificationConfig(args.tenantId, key);
    if (!config.enabled) return { sent: false, reason: 'EVENT_DISABLED' };

    const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[key];
    const variables: Record<string, string> = {
      recipientName: args.recipientName,
      agencyName: args.agencyName,
      accessType: externalAccessTypeLabel(args.type),
      accessUrl: args.accessUrl,
      expiresAt: args.linkExpiresAt.toLocaleDateString('fr-FR', { timeZone: 'UTC' })
    };
    const escaped = Object.fromEntries(Object.entries(variables).map(([name, value]) => [name, escapeHtml(value)]));

    await emailService.sendEmail({
      to: args.recipientEmail,
      // Le sujet part en texte brut et ne contient jamais l'URL.
      subject: applyTemplate(config.subjectOverride || defaults.subject, {
        ...variables,
        accessUrl: ''
      }),
      html: applyTemplate(config.bodyHtmlOverride || defaults.bodyHtml, escaped),
      tenantId: args.tenantId
    });
    return { sent: true };
  } catch (error) {
    // Jamais l'adresse, l'URL ni le message du transport : seulement le type d'erreur.
    logger.warn('Accès tiers : envoi du lien par e-mail échoué', {
      tenantId: args.tenantId,
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
    return { sent: false, reason: 'SEND_FAILED' };
  }
}
