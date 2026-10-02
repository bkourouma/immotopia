import React from 'react';
import { Tag } from 'antd';
import { t } from '../../i18n/t';
import { formatYieldPercent } from '../../components/patrimoine/patrimoine-format';

/** `null`/absent affichés en tiret — jamais un zéro ou un vide inventé. */
export const DASH = '—';

/**
 * Devise à passer à `formatMoney` (le formateur commun des montants).
 *
 * L'API renvoie le code ISO « XOF », que `formatMoney` recopiait tel quel : le
 * portail disait « 45 000 000 XOF » là où tout le reste de l'application dit
 * « FCFA ». Pour le franc CFA on ne transmet donc rien, et `formatMoney` écrit
 * sa devise par défaut ; une autre devise reste inchangée.
 */
export const deviseAffichee = (code: string | null | undefined): string | undefined =>
  !code || code === 'XOF' ? undefined : code;

/** Même formateur que les écrans de l'agence : arrondi au plus proche, séparateurs selon la langue. */
export const formatPercent = (value: number | null | undefined): string => formatYieldPercent(value);

/** Quote-part d'indivision ; `null` = bien détenu en entier. */
export const sharePercentLabel = (value: number | null): string =>
  value === null ? t('Bien entier') : formatYieldPercent(value);

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
