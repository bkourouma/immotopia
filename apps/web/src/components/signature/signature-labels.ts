import { t } from '../../i18n/t';
import type { SignatureRequestStatus, SignerChannel, SignerStatus } from '../../types/signature-types';

/** Rôles proposés à l'envoi (valeurs du modèle de données, spec 043). */
export const SIGNER_ROLES = ['LOCATAIRE', 'CO_LOCATAIRE', 'BAILLEUR', 'AGENT'] as const;

export function roleLabel(role: string): string {
  switch (role) {
    case 'LOCATAIRE':
      return t('Locataire');
    case 'CO_LOCATAIRE':
      return t('Co-locataire');
    case 'BAILLEUR':
      return t('Bailleur');
    case 'AGENT':
      return t('Agent');
    default:
      return role;
  }
}

export function channelLabel(channel: SignerChannel): string {
  switch (channel) {
    case 'EMAIL':
      return t('E-mail');
    case 'WHATSAPP':
      return t('WhatsApp');
    default:
      return t('Sur place');
  }
}

export function requestStatusLabel(status: SignatureRequestStatus): { label: string; color: string } {
  switch (status) {
    case 'DRAFT':
      return { label: t('Brouillon'), color: 'default' };
    case 'SENT':
      return { label: t('Envoyée'), color: 'blue' };
    case 'PARTIALLY_SIGNED':
      return { label: t('Partiellement signée'), color: 'gold' };
    case 'COMPLETED':
      return { label: t('Signée'), color: 'green' };
    case 'DECLINED':
      return { label: t('Refusée'), color: 'red' };
    case 'EXPIRED':
      return { label: t('Expirée'), color: 'default' };
    default:
      return { label: t('Annulée'), color: 'default' };
  }
}

export function signerStatusLabel(status: SignerStatus): { label: string; color: string } {
  switch (status) {
    case 'PENDING':
      return { label: t('En attente'), color: 'default' };
    case 'OPENED':
      return { label: t('Document ouvert'), color: 'blue' };
    case 'SIGNED':
      return { label: t('A signé'), color: 'green' };
    default:
      return { label: t('A refusé'), color: 'red' };
  }
}

/** Une demande encore ouverte : on peut relancer, annuler ou signer sur place. */
export function isOpenRequest(status: SignatureRequestStatus): boolean {
  return status === 'SENT' || status === 'PARTIALLY_SIGNED';
}
