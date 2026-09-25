import type { StatusTone } from '../primitives';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

/** Libellés communs des factures d'abonnement (super-admin et agence). */

export const INVOICE_STATUS_LABEL: Record<string, { label: string; tone: StatusTone }> = {
  DRAFT: { label: t('Brouillon'), tone: 'neutral' },
  ISSUED: { label: t('Émise'), tone: 'info' },
  OVERDUE: { label: t('En retard'), tone: 'danger' },
  PAID: { label: t('Payée'), tone: 'success' },
  FAILED: { label: t('Échouée'), tone: 'danger' },
  CANCELED: { label: t('Annulée'), tone: 'neutral' },
  REFUNDED: { label: t('Remboursée'), tone: 'neutral' }
};

export const INVOICE_NATURE_LABEL: Record<string, string> = {
  PERIOD: t('Période'),
  OVERAGE: t('Dépassement'),
  CREDIT_NOTE: t('Avoir')
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  ONLINE: t('En ligne (PaySecureHub)'),
  BANK_TRANSFER: t('Virement'),
  MOBILE_MONEY: t('Mobile Money'),
  CHECK: t('Chèque'),
  CASH: t('Espèces')
};

/** Statuts qui attendent un règlement (platform-payment-service.ts, PAYABLE_INVOICE_STATUSES). */
export const PAYABLE_STATUSES = ['ISSUED', 'OVERDUE', 'FAILED'];

export function formatDay(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(activeLocale());
}

export function formatPeriod(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  return `${formatDay(start)} — ${formatDay(end)}`;
}
