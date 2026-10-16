import dayjs from 'dayjs';
import type { CheckoutOrigin, OnlineCheckoutStatus, ReviewKind } from '../../../services/syndic-online-payment-service';
import { t } from '../../../i18n/t';

/** Message du serveur (déjà traduit, contrat §0), sinon le texte de repli. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
  return data?.message || data?.error || fallback;
}

export function apiErrorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
}

export const STATUS_ORDER: OnlineCheckoutStatus[] = ['REVIEW', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELED', 'EXPIRED'];

export function statusLabel(status: OnlineCheckoutStatus): string {
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

export const STATUS_COLOR: Record<OnlineCheckoutStatus, string> = {
  PENDING: 'processing',
  SUCCESS: 'success',
  FAILED: 'error',
  CANCELED: 'default',
  EXPIRED: 'default',
  REVIEW: 'warning'
};

export function originLabel(origin: CheckoutOrigin): string {
  return origin === 'PORTAL' ? t('Portail') : t('Lien de paiement');
}

export function reviewKindLabel(kind: ReviewKind, chargePaymentId?: string | null): string {
  switch (kind) {
    case 'AMOUNT_MISMATCH':
      return t('Montant payé différent du montant attendu');
    case 'FISCAL_YEAR_CLOSED':
      return t('Exercice clos à la date du paiement');
    case 'CALLS_UNAVAILABLE':
      return t('Un appel visé a disparu ou n’appartient plus au lot');
    case 'DUPLICATE_TRANSACTION':
      return t('Transaction fournisseur déjà enregistrée');
    case 'CONTRARY_STATE':
      return chargePaymentId
        ? t('Le fournisseur rapporte un échec ou une annulation après un succès')
        : t('Succès du fournisseur après expiration de la tentative');
  }
}

/**
 * Règles du contrat §1.7 : ce que chaque motif autorise. `CONTRARY_STATE` avec
 * encaissement : seul le classement du suivi ; sans encaissement (succès tardif
 * après expiration) : accepter encaisse, refuser clôt la tentative en échec.
 */
export function allowedDecisions(
  kind: ReviewKind | null,
  chargePaymentId?: string | null
): { accept: boolean; reject: boolean } {
  if (kind === 'DUPLICATE_TRANSACTION') return { accept: false, reject: true };
  if (kind === 'CONTRARY_STATE') return { accept: true, reject: !chargePaymentId };
  return { accept: true, reject: true };
}

export function formatDateTime(value: string | null | undefined): string {
  return value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '—';
}

export function formatDay(value: string | null | undefined): string {
  return value ? dayjs(value).format('DD/MM/YYYY') : '—';
}
