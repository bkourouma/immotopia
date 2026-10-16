import React from 'react';
import { Tag } from 'antd';
import type {
  MandateStatus,
  PrenotificationStatus,
  RemittanceLineStatus,
  RemittanceStatus,
  SkipReason
} from '../../../services/direct-debit-service';
import { t } from '../../../i18n/t';
import { activeLocale } from '../../../i18n/format';
import { parseIsoDay } from './business-days';

/** Libellés et couleurs des statuts d'un mandat (spec 042, PB2). */
export function mandateStatusLabel(status: MandateStatus): string {
  switch (status) {
    case 'DRAFT':
      return t('Brouillon');
    case 'ACTIVE':
      return t('Actif');
    case 'SUSPENDED':
      return t('Suspendu');
    case 'REVOKED':
      return t('Révoqué');
    default:
      return status;
  }
}

const STATUS_COLOR: Record<MandateStatus, string> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  REVOKED: 'error'
};

export const MandateStatusTag: React.FC<{ status: MandateStatus }> = ({ status }) => (
  <Tag color={STATUS_COLOR[status] ?? 'default'}>{mandateStatusLabel(status)}</Tag>
);

export const MANDATE_STATUSES: MandateStatus[] = ['DRAFT', 'ACTIVE', 'SUSPENDED', 'REVOKED'];

/**
 * Message affiché pour une erreur d'API. Un 403 n'a pas de crochet de
 * permission côté écran : on traduit le refus en phrase claire.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const err = error as { response?: { status?: number; data?: { message?: string; error?: string } } };
  if (err?.response?.status === 403) {
    return t("Vous n'avez pas l'autorisation d'effectuer cette action.");
  }
  return err?.response?.data?.message || err?.response?.data?.error || fallback;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(activeLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// --- P2 : remises de loyers ----------------------------------------------------

/** Libellés et couleurs du statut d'une remise (spec 042, P2, §7.3). */
export function remittanceStatusLabel(status: RemittanceStatus): string {
  switch (status) {
    case 'DRAFT':
      return t('Brouillon');
    case 'VALIDATED':
      return t('Validée');
    case 'EXPORTED':
      return t('Fichier produit');
    case 'SUBMITTED':
      return t('Déposée à la banque');
    case 'CANCELED':
      return t('Annulée');
    default:
      return status;
  }
}

const REMITTANCE_STATUS_COLOR: Record<RemittanceStatus, string> = {
  DRAFT: 'default',
  VALIDATED: 'processing',
  EXPORTED: 'warning',
  SUBMITTED: 'success',
  CANCELED: 'error'
};

export const REMITTANCE_STATUSES: RemittanceStatus[] = ['DRAFT', 'VALIDATED', 'EXPORTED', 'SUBMITTED', 'CANCELED'];

export const RemittanceStatusTag: React.FC<{ status: RemittanceStatus }> = ({ status }) => (
  <Tag color={REMITTANCE_STATUS_COLOR[status] ?? 'default'}>{remittanceStatusLabel(status)}</Tag>
);

export function lineStatusLabel(status: RemittanceLineStatus): string {
  switch (status) {
    case 'PENDING':
      return t('À prélever');
    case 'CANCELED':
      return t('Annulée');
    default:
      return status;
  }
}

export const RemittanceLineStatusTag: React.FC<{ status: RemittanceLineStatus }> = ({ status }) => (
  <Tag color={status === 'CANCELED' ? 'error' : 'processing'}>{lineStatusLabel(status)}</Tag>
);

export function prenotificationStatusLabel(status: PrenotificationStatus): string {
  switch (status) {
    case 'PENDING':
      return t('En attente');
    case 'SENT':
      return t('Envoyée');
    case 'NO_EMAIL':
      return t('Sans e-mail');
    case 'DISABLED':
      return t('Désactivée');
    case 'FAILED':
      return t('Échec');
    default:
      return status;
  }
}

const PRENOTIFICATION_COLOR: Record<PrenotificationStatus, string> = {
  PENDING: 'default',
  SENT: 'success',
  NO_EMAIL: 'warning',
  DISABLED: 'default',
  FAILED: 'error'
};

export const PrenotificationTag: React.FC<{ status: PrenotificationStatus }> = ({ status }) => (
  <Tag color={PRENOTIFICATION_COLOR[status] ?? 'default'}>{prenotificationStatusLabel(status)}</Tag>
);

/** Raison pour laquelle un mandat n'entre pas dans la remise. */
export function skipReasonLabel(reason: SkipReason): string {
  switch (reason) {
    case 'NO_INSTALLMENT':
      return t('Aucune échéance pour ce mois');
    case 'NOTHING_DUE':
      return t('Rien à payer : échéance soldée ou annulée');
    case 'ALREADY_IN_REMITTANCE':
      return t('Échéance déjà dans une remise');
    case 'LEASE_NOT_ACTIVE':
      return t("Le bail n'est pas actif");
    case 'COLLECTION_DAY_LATER':
      return t('Jour de collecte plus tard dans le mois');
    default:
      return reason;
  }
}

/** Date seule `AAAA-MM-JJ` au format de la locale, sans décalage de fuseau. */
export function formatDay(value: string | null | undefined): string {
  const day = parseIsoDay(value);
  if (!day) return formatDate(value);
  return day.toLocaleDateString(activeLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Mois et année lisibles : « octobre 2026 ». */
export function formatPeriod(year: number, month: number): string {
  const date = new Date(year, month - 1, 1, 12);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(activeLocale(), { month: 'long', year: 'numeric' });
}
