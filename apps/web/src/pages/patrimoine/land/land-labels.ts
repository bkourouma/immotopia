import { t } from '../../../i18n/t';
import { activeLocale } from '../../../i18n/format';
import { formatMoney } from '../../../components/primitives';
import type { LandRegularizationStatus, LandStepStatus } from './land-types';

/**
 * Libellés du lot B2. Des fonctions, et non des constantes de module : `t()`
 * se lit au rendu, dans la langue affichée.
 */

export const DEVISE_FONCIER = 'XOF';

export function regularizationStatusLabel(status: LandRegularizationStatus): string {
  switch (status) {
    case 'EN_COURS':
      return t('En cours');
    case 'TERMINEE':
      return t('Terminé');
    case 'ABANDONNEE':
      return t('Abandonné');
  }
}

export function regularizationStatusColor(status: LandRegularizationStatus): string {
  switch (status) {
    case 'EN_COURS':
      return 'processing';
    case 'TERMINEE':
      return 'success';
    case 'ABANDONNEE':
      return 'default';
  }
}

export function regularizationStatusOptions(): Array<{ value: LandRegularizationStatus; label: string }> {
  return (['EN_COURS', 'TERMINEE', 'ABANDONNEE'] as const).map(value => ({
    value,
    label: regularizationStatusLabel(value)
  }));
}

export function stepStatusLabel(status: LandStepStatus): string {
  switch (status) {
    case 'A_FAIRE':
      return t('À faire');
    case 'EN_COURS':
      return t('En cours');
    case 'TERMINEE':
      return t('Terminée');
    case 'BLOQUEE':
      return t('Bloquée');
  }
}

export function stepStatusColor(status: LandStepStatus): string {
  switch (status) {
    case 'A_FAIRE':
      return 'default';
    case 'EN_COURS':
      return 'processing';
    case 'TERMINEE':
      return 'success';
    case 'BLOQUEE':
      return 'error';
  }
}

/**
 * Libellé du bouton qui mène l'étape de `from` à `to`. La règle de transition
 * reste côté serveur (`allowedTransitions`) : ici on ne fait que nommer.
 */
export function stepTransitionLabel(from: LandStepStatus, to: LandStepStatus): string {
  if (from === 'TERMINEE' && to === 'EN_COURS') return t("Rouvrir l'étape");
  switch (to) {
    case 'EN_COURS':
      return from === 'BLOQUEE' ? t('Débloquer') : t('Démarrer');
    case 'TERMINEE':
      return t("Terminer l'étape");
    case 'BLOQUEE':
      return t('Marquer comme bloquée');
    case 'A_FAIRE':
      return t('Remettre à faire');
  }
}

export function formatXof(value: number | null | undefined): string {
  return formatMoney(value, { currency: DEVISE_FONCIER });
}

export function formatLandDate(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(activeLocale(), { timeZone: 'UTC' });
}

/** Valeur d'un `<input type="date">` (AAAA-MM-JJ) à partir d'une date ISO. */
export function toDateInput(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

/** Un `?status=` inconnu dans l'URL est ignoré : il ne part jamais à l'API. */
export function parseRegularizationStatus(value: string | null): LandRegularizationStatus | undefined {
  return value === 'EN_COURS' || value === 'TERMINEE' || value === 'ABANDONNEE' ? value : undefined;
}
