import { t } from '../../i18n/t';
import type { SignatureRequestStatus } from '../../types/signature-types';

/** Types de documents signables (valeurs de `SignatureKind`, filtre `kind`). */
export const SIGNATURE_KINDS = [
  'LEASE_CONTRACT',
  'MANAGEMENT_MANDATE',
  'SALE_MANDATE',
  'LEASE_INSPECTION',
  'SALE_AGREEMENT',
  'DIRECT_DEBIT_MANDATE',
  'SYNDIC_DIRECT_DEBIT_MANDATE'
] as const;

/** Statuts affichés en pastilles, dans l'ordre de lecture. */
export const SIGNATURE_STATUSES: SignatureRequestStatus[] = [
  'SENT',
  'PARTIALLY_SIGNED',
  'COMPLETED',
  'DECLINED',
  'EXPIRED',
  'CANCELED',
  'DRAFT'
];

export function kindLabel(kind: string): string {
  switch (kind) {
    case 'LEASE_CONTRACT':
      return t('Contrat de bail');
    case 'MANAGEMENT_MANDATE':
      return t('Mandat de gestion');
    case 'SALE_MANDATE':
      return t('Mandat de vente');
    case 'LEASE_INSPECTION':
      return t('État des lieux');
    case 'SALE_AGREEMENT':
      return t('Compromis de vente');
    case 'DIRECT_DEBIT_MANDATE':
      return t('Autorisation de prélèvement (bail)');
    case 'SYNDIC_DIRECT_DEBIT_MANDATE':
      return t('Autorisation de prélèvement (copropriété)');
    default:
      return kind;
  }
}

/** Libellé lisible d'un type d'événement de la piste de preuve ; inconnu = valeur brute. */
export function eventLabel(type: string): string {
  switch (type) {
    case 'CREATED':
      return t('Demande créée');
    case 'INVITE_SENT':
      return t('Invitation envoyée');
    case 'INVITE_FAILED':
      return t("Échec de l'envoi de l'invitation");
    case 'OPENED':
      return t('Document ouvert');
    case 'OTP_SENT':
      return t('Code de vérification envoyé');
    case 'OTP_FAILED':
      return t('Code de vérification erroné');
    case 'OTP_LOCKED':
      return t('Vérification verrouillée');
    case 'SIGNED':
      return t('Signature apposée');
    case 'DECLINED':
      return t('Signature refusée');
    case 'SEALED':
      return t('Document scellé');
    case 'EXPIRED':
      return t('Demande expirée');
    case 'CANCELED':
      return t('Demande annulée');
    case 'REMINDER_SENT':
      return t('Rappel envoyé');
    case 'REMINDER_AUTO':
      return t('Rappel automatique envoyé');
    default:
      return type;
  }
}

/**
 * Adresse du document cible dans l'application, ou `null` quand aucune route
 * ne l'ouvre (état des lieux et mandat de gestion vivent dans l'onglet d'un
 * bail ou d'un bien, dont l'identifiant n'est pas celui de la cible).
 */
export function targetHref(tenantId: string | undefined, targetType: string, targetId: string): string | null {
  if (!tenantId || !targetId) return null;
  const base = `/tenant/${encodeURIComponent(tenantId)}`;
  const id = encodeURIComponent(targetId);
  switch (targetType) {
    case 'RentalLease':
      return `${base}/rental/leases/${id}`;
    case 'SaleAgreement':
      return `${base}/sales/agreements/${id}`;
    case 'SaleMandate':
      return `${base}/sales/mandates/${id}`;
    default:
      return null;
  }
}
