import dayjs from 'dayjs';
import type {
  DeclarationAlert,
  DeclarationRejectReason,
  DeclarationStatus,
  MobileMoneyOperator,
  PrefillField,
  SyndicDeclarationRow
} from '../../../services/syndic-declared-payment-service';
import { formatMoney } from '../../primitives';
import { t } from '../../../i18n/t';

export { apiErrorMessage, apiErrorCode, formatDateTime } from '../online-payment/helpers';

export const MAX_DECLARATION_AMOUNT = 5_000_000;
export const NOTE_MIN_LENGTH = 10;
export const NOTE_MAX_LENGTH = 500;
export const INSTRUCTIONS_MAX_LENGTH = 500;
export const DECLARATION_NOT_PENDING_CODE = 'DECLARATION_NOT_PENDING';
export const MONTHLY_AI_QUOTA_FALLBACK = 300;

export function operatorLabel(op: MobileMoneyOperator): string {
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

const OPERATORS: MobileMoneyOperator[] = ['ORANGE', 'MTN', 'MOOV', 'WAVE', 'OTHER'];

export const OPERATOR_OPTIONS = OPERATORS.map(value => ({ value, label: operatorLabel(value) }));

export function statusLabel(status: DeclarationStatus): string {
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

export const STATUS_COLOR: Record<DeclarationStatus, string> = {
  PENDING: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELED: 'default'
};

export function rejectReasonLabel(reason: DeclarationRejectReason): string {
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

const REJECT_REASONS: DeclarationRejectReason[] = [
  'NOT_FOUND',
  'AMOUNT_MISMATCH',
  'REFERENCE_USED',
  'WRONG_NUMBER',
  'OTHER'
];

export const REJECT_REASON_OPTIONS = REJECT_REASONS.map(value => ({ value, label: rejectReasonLabel(value) }));

export function prefillFieldLabel(field: PrefillField): string {
  switch (field) {
    case 'operator':
      return t('Opérateur');
    case 'amount':
      return t('Montant');
    case 'paidAt':
      return t('Date et heure');
    case 'transactionReference':
      return t('Référence de transaction');
    case 'payerPhone':
      return t('Numéro payeur');
  }
}

/** « +225 07 07 07 07 07 » pour un E.164 ivoirien ; sinon la chaîne telle quelle. */
export function formatPhone(e164: string): string {
  const match = /^\+225(\d{10})$/.exec(e164);
  if (!match) return e164;
  const pairs = match[1].match(/\d{2}/g) ?? [];
  return `+225 ${pairs.join(' ')}`;
}

/** Libellé et gravité d'une alerte de contrôle (R17). */
export function alertView(
  alert: DeclarationAlert,
  row: Pick<SyndicDeclarationRow, 'lines'>
): { severity: 'info' | 'warning' | 'error'; text: string } {
  const lotOf = (lotId: string): string => row.lines.find(line => line.lot.id === lotId)?.lot.lotNumber ?? '—';
  switch (alert.kind) {
    case 'REFERENCE_ON_EXISTING_PAYMENT':
      return {
        severity: 'warning',
        text: t('Cette référence figure déjà sur un paiement enregistré le {{date}}, de {{montant}}.', {
          date: dayjs(alert.paidAt).format('DD/MM/YYYY'),
          montant: formatMoney(alert.amount)
        })
      };
    case 'PROBABLE_DUPLICATE':
      return {
        severity: 'warning',
        text: t(
          'Doublon probable : même numéro de réception, même montant et même payeur qu’une autre déclaration, à moins de 10 minutes.'
        )
      };
    case 'EXCESS':
      return {
        severity: 'info',
        text: t('L’excédent de {{montant}} deviendra une avance du lot {{lot}}.', {
          montant: formatMoney(alert.excess),
          lot: lotOf(alert.lotId)
        })
      };
    case 'PARTIAL':
      return {
        severity: 'info',
        text: t('Paiement partiel : il restera {{montant}} dû sur le lot {{lot}}.', {
          montant: formatMoney(alert.remaining),
          lot: lotOf(alert.lotId)
        })
      };
    case 'DECLARANT_NOT_CURRENT_OWNER':
      return {
        severity: 'warning',
        text: t('Le déclarant n’est plus le copropriétaire actuel du lot {{lot}}.', { lot: lotOf(alert.lotId) })
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
    case 'FISCAL_YEAR_CLOSED':
      return {
        severity: 'error',
        text: t(
          'La date déclarée tombe dans un exercice clos : une date d’exercice ouvert sera demandée à la validation.'
        )
      };
    case 'OVERDUE':
      return {
        severity: 'warning',
        text: t('En attente depuis {{n}} jours ouvrés.', { n: alert.businessDays })
      };
  }
}

/** Vrai si la déclaration porte un soupçon de doublon (référence connue ou doublon probable). */
export function hasDuplicateSuspicion(row: Pick<SyndicDeclarationRow, 'alerts'>): boolean {
  return row.alerts.some(a => a.kind === 'PROBABLE_DUPLICATE' || a.kind === 'REFERENCE_ON_EXISTING_PAYMENT');
}
