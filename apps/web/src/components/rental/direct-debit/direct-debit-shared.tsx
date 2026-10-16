import React from 'react';
import { Tag } from 'antd';
import type { MandateStatus } from '../../../services/direct-debit-service';
import { t } from '../../../i18n/t';
import { activeLocale } from '../../../i18n/format';

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
