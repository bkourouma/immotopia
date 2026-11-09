import dayjs from 'dayjs';
import type {
  RentalDeclarationAlert,
  RentalDeclarationRejectReason,
  RentalDeclarationStatus,
  RentalMobileMoneyOperator,
  RentalPaymentDeclarationDto,
  RentalPrefillField
} from '../../../types/rental-declared-payment';
import { formatMontantLocatif } from '../../../lib/rental-labels';
import { t } from '../../../i18n/t';

export const NOTE_MIN_LENGTH = 10;
export const NOTE_MAX_LENGTH = 500;
export const LABEL_MAX_LENGTH = 60;

/** Message du serveur (déjà traduit), sinon le texte de repli. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
  return data?.message || data?.error || fallback;
}

export function apiErrorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
}

export const DECLARATION_ALREADY_REVIEWED_CODE = 'RENTAL_DECLARATION_ALREADY_REVIEWED';

export function formatDateTime(value: string | null | undefined): string {
  return value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '—';
}

export function formatDay(value: string | null | undefined): string {
  return value ? dayjs(value).format('DD/MM/YYYY') : '—';
}

/**
 * Locataire de la déclaration : le déclarant enregistré, jamais le gestionnaire
 * qui l'a saisie pour lui. Repli sur `declaredBy` (ancienne API sans
 * `tenantName`) seulement quand c'est le locataire lui-même qui a déclaré.
 */
export function declarationTenantName(declaration: RentalPaymentDeclarationDto): string {
  if (declaration.tenantName) return declaration.tenantName;
  return declaration.declaredBy.type === 'TENANT' && declaration.declaredBy.name ? declaration.declaredBy.name : '—';
}

export function formatAmount(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : formatMontantLocatif(value);
}

export function operatorLabel(op: RentalMobileMoneyOperator): string {
  switch (op) {
    case 'ORANGE':
      return t('Orange Money');
    case 'MTN':
      return t('MTN MoMo');
    case 'MOOV':
      return t('Moov Money');
    case 'WAVE':
      return t('Wave');
    case 'OTHER':
      return t('Autre');
  }
}

const OPERATORS: RentalMobileMoneyOperator[] = ['ORANGE', 'MTN', 'MOOV', 'WAVE', 'OTHER'];

/** Options d'un sélecteur d'opérateur (libellés lus à l'appel : ils suivent la langue). */
export const operatorOptions = () => OPERATORS.map(value => ({ value, label: operatorLabel(value) }));

export function statusLabel(status: RentalDeclarationStatus): string {
  switch (status) {
    case 'PENDING':
      return t('En attente');
    case 'APPROVED':
      return t('Validée');
    case 'REJECTED':
      return t('Rejetée');
    case 'CANCELED':
      return t('Annulée');
  }
}

export const STATUS_COLOR: Record<RentalDeclarationStatus, string> = {
  PENDING: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELED: 'default'
};

export function rejectReasonLabel(reason: RentalDeclarationRejectReason): string {
  switch (reason) {
    case 'NOT_FOUND':
      return t('Paiement introuvable');
    case 'AMOUNT_MISMATCH':
      return t('Montant ne correspondant pas');
    case 'REFERENCE_USED':
      return t('Référence déjà utilisée');
    case 'WRONG_NUMBER':
      return t('Numéro de réception erroné');
    case 'OTHER':
      return t('Autre');
  }
}

const REJECT_REASONS: RentalDeclarationRejectReason[] = [
  'NOT_FOUND',
  'AMOUNT_MISMATCH',
  'REFERENCE_USED',
  'WRONG_NUMBER',
  'OTHER'
];

export const rejectReasonOptions = () => REJECT_REASONS.map(value => ({ value, label: rejectReasonLabel(value) }));

export function prefillFieldLabel(field: RentalPrefillField): string {
  switch (field) {
    case 'operator':
      return t('Opérateur');
    case 'amount':
      return t('Montant');
    case 'paidAt':
      return t('Date et heure');
    case 'reference':
      return t('Référence de transaction');
    case 'payerPhone':
      return t('Numéro payeur');
  }
}

/** « +225 07 07 07 07 07 » pour un E.164 ivoirien ; sinon la chaîne telle quelle. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '—';
  const match = /^\+225(\d{10})$/.exec(e164);
  if (!match) return e164;
  const pairs = match[1].match(/\d{2}/g) ?? [];
  return `+225 ${pairs.join(' ')}`;
}

/** « Novembre 2026 » pour une échéance. */
export function installmentLabel(installment: RentalPaymentDeclarationDto['installment']): string {
  if (!installment) return t('Sans échéance');
  return `${String(installment.periodMonth).padStart(2, '0')}/${installment.periodYear}`;
}

/** Libellé et gravité d'une alerte de contrôle. */
export function alertView(alert: RentalDeclarationAlert): { severity: 'info' | 'warning' | 'error'; text: string } {
  switch (alert.kind) {
    case 'DUPLICATE_SUSPECTED':
      return {
        severity: 'warning',
        text: t('Doublon probable : même montant, même jour et même échéance qu’une autre déclaration.')
      };
    case 'AMOUNT_DIFFERS_FROM_DUE':
      return {
        severity: 'info',
        text: t('Le montant déclaré diffère du reste dû de l’échéance ({{montant}}).', {
          montant: formatMontantLocatif(alert.due)
        })
      };
    case 'AI_FIELDS_EDITED':
      return {
        severity: 'info',
        text: t('Champs proposés par l’IA puis modifiés par le déclarant : {{champs}}.', {
          champs: alert.fields.map(prefillFieldLabel).join(', ')
        })
      };
    case 'RECIPIENT_MISMATCH':
      return {
        severity: 'warning',
        text: t('La capture montre un autre numéro de réception : {{numero}}.', {
          numero: formatPhone(alert.recipientPhone)
        })
      };
    case 'OVERDUE':
      return {
        severity: 'warning',
        text: t('En attente depuis {{n}} jours ouvrés.', { n: alert.businessDays })
      };
  }
}
