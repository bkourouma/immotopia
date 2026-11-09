import dayjs from 'dayjs';
import type {
  RentalOnlineCheckoutOrigin,
  RentalOnlineCheckoutStatus,
  RentalOnlineReviewKind,
  RentalOnlinePaymentRowDto
} from '../../../types/rental-online-payment';
import { t } from '../../../i18n/t';

/** Message du serveur (déjà traduit), sinon le texte de repli. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
  return data?.message || data?.error || fallback;
}

export function apiErrorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
}

export const STATUS_ORDER: RentalOnlineCheckoutStatus[] = [
  'REVIEW',
  'PENDING',
  'SUCCESS',
  'FAILED',
  'CANCELED',
  'EXPIRED'
];

export function statusLabel(status: RentalOnlineCheckoutStatus): string {
  switch (status) {
    case 'PENDING':
      return t('En attente');
    case 'SUCCESS':
      return t('Payé');
    case 'FAILED':
      return t('Échoué');
    case 'CANCELED':
      return t('Annulé');
    case 'EXPIRED':
      return t('Expiré');
    case 'REVIEW':
      return t('À trancher');
  }
}

export const STATUS_COLOR: Record<RentalOnlineCheckoutStatus, string> = {
  PENDING: 'processing',
  SUCCESS: 'success',
  FAILED: 'error',
  CANCELED: 'default',
  EXPIRED: 'default',
  REVIEW: 'warning'
};

export function originLabel(origin: RentalOnlineCheckoutOrigin): string {
  return origin === 'PORTAL' ? t('Portail') : t('Lien de paiement');
}

export function reviewKindLabel(kind: RentalOnlineReviewKind): string {
  switch (kind) {
    case 'AMOUNT_MISMATCH':
      return t('Montant payé différent du montant attendu');
    case 'CONTRARY_STATE':
      return t('État contraire rapporté par la passerelle');
    case 'DUPLICATE_TRANSACTION':
      return t('Transaction fournisseur déjà enregistrée');
    case 'INSTALLMENT_UNAVAILABLE':
      return t('Une échéance visée n’est plus disponible');
  }
}

/**
 * Règles du contrat §2.5 : ce que chaque motif autorise.
 * - DUPLICATE_TRANSACTION : refus seul ;
 * - CONTRARY_STATE avec encaissement déjà fait (`collected`) : accepter clôt, refuser est interdit ;
 * - les autres : les deux décisions.
 */
export function allowedDecisions(row: Pick<RentalOnlinePaymentRowDto, 'reviewKind' | 'collected'>): {
  accept: boolean;
  reject: boolean;
} {
  if (row.reviewKind === 'DUPLICATE_TRANSACTION') return { accept: false, reject: true };
  if (row.reviewKind === 'CONTRARY_STATE' && row.collected) return { accept: true, reject: false };
  return { accept: true, reject: true };
}

/** Libellé court d'une période d'échéance (MM/AAAA). */
export function periodLabel(year: number, month: number): string {
  return `${String(month).padStart(2, '0')}/${year}`;
}

export function formatDateTime(value: string | null | undefined): string {
  return value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '—';
}

export function formatDay(value: string | null | undefined): string {
  return value ? dayjs(value).format('DD/MM/YYYY') : '—';
}
