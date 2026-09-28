import React from 'react';
import { Tag } from 'antd';
import { t } from '../../i18n/t';

/** `null`/absent affichés en tiret — jamais un zéro ou un vide inventé. */
export const DASH = '—';

export const formatPercent = (value: number | null | undefined): string =>
  value === null || value === undefined ? DASH : `${value.toFixed(2)} %`;

/** Quote-part d'indivision ; `null` = bien détenu en entier. */
export const sharePercentLabel = (value: number | null): string =>
  value === null ? t('Bien entier') : `${value.toFixed(2)} %`;

export function loanStatusTag(status: string): React.ReactNode {
  const map: Record<string, { label: string; color: string }> = {
    ACTIVE: { label: t('Actif'), color: 'success' },
    CLOSED: { label: t('Clôturé'), color: 'default' },
    DEFAULTED: { label: t('Défaillant'), color: 'error' }
  };
  const config = map[status] || { label: status, color: 'default' };
  return React.createElement(Tag, { color: config.color }, config.label);
}

export function workStatusTag(status: string): React.ReactNode {
  const map: Record<string, { label: string; color: string }> = {
    PLANNED: { label: t('Prévu'), color: 'default' },
    IN_PROGRESS: { label: t('En cours'), color: 'processing' },
    COMPLETED: { label: t('Terminé'), color: 'success' },
    CANCELLED: { label: t('Annulé'), color: 'error' }
  };
  const config = map[status] || { label: status, color: 'default' };
  return React.createElement(Tag, { color: config.color }, config.label);
}

export function valuationMethodLabel(method: string): string {
  if (method === 'MANUAL') return t('Manuelle');
  if (method === 'MARKET_ESTIMATE') return t('Estimation de marché');
  if (method === 'EXPERT_APPRAISAL') return t('Expertise');
  return method;
}

export function documentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    TITLE_DEED: t('Titre de propriété'),
    LAND_CONCESSION: t('Arrêté de concession définitive (ACD)'),
    NOTARIAL_DEED: t('Acte notarié'),
    BUILDING_PERMIT: t('Permis de construire'),
    PLAN: t('Plan'),
    TECHNICAL_DIAGNOSIS: t('Diagnostic technique'),
    INSURANCE: t('Assurance'),
    TAX_DOCUMENT: t('Document fiscal'),
    MANDATE: t('Mandat'),
    SYNDICATE_PV: t("Procès-verbal d'assemblée"),
    SYNDICATE_BUDGET: t('Budget du syndicat'),
    SYNDICATE_CONTRAT: t('Contrat du syndicat'),
    SYNDICATE_REGL_COPRO: t('Règlement de copropriété'),
    OTHER: t('Autre')
  };
  return labels[type] || type;
}
