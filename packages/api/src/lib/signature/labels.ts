import { t, type Language } from '../../i18n';

/**
 * Libellés lisibles des codes de rôle et de canal d'un signataire, pour les
 * documents produits côté API (certificat PDF scellé). Mêmes valeurs que
 * `apps/web/src/components/signature/signature-labels.ts`. Une valeur inconnue
 * est rendue telle quelle.
 */

export function signerRoleLabel(role: string, lang: Language): string {
  switch (role) {
    case 'LOCATAIRE':
      return t('Locataire', undefined, lang);
    case 'CO_LOCATAIRE':
      return t('Co-locataire', undefined, lang);
    case 'BAILLEUR':
      return t('Bailleur', undefined, lang);
    case 'AGENT':
      return t('Agent', undefined, lang);
    case 'MANDANT':
      return t('Mandant', undefined, lang);
    case 'VENDEUR':
      return t('Vendeur', undefined, lang);
    case 'COVENDEUR':
      return t('Co-vendeur', undefined, lang);
    case 'ACQUEREUR':
      return t('Acquéreur', undefined, lang);
    default:
      return role;
  }
}

export function signerChannelLabel(channel: string, lang: Language): string {
  switch (channel) {
    case 'EMAIL':
      return t('E-mail', undefined, lang);
    case 'WHATSAPP':
      return t('WhatsApp', undefined, lang);
    case 'SMS':
      return t('SMS', undefined, lang);
    case 'IN_PERSON':
      return t('Sur place', undefined, lang);
    default:
      return channel;
  }
}
