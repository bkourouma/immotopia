import type { AssetValuation, ExpenseRecurrence, PropertyExpense, PropertyLoan } from '../../types/patrimoine-types';
import { PATRIMONY_DOC_TYPES } from '../../types/patrimoine-types';
import { t } from '../../i18n/t';

/**
 * Libellés du module Patrimoine, en un seul endroit.
 *
 * Ils étaient recopiés dans chaque composant (onglet du bien, historique,
 * crédits, dépenses, coffre-fort) et plusieurs copies avaient perdu leur `t()`
 * — « Actif », « Manuelle », « Assurance », « Autre » restaient en français
 * dans une interface anglaise ou arabe, et `PLAN`/`MANDATE` s'affichaient en
 * code brut. Des fonctions, et non des constantes de module : `t()` se lit au
 * rendu, dans la langue affichée.
 */

export function documentTypeLabel(type: string): string {
  switch (type) {
    case 'TITLE_DEED':
      return t('Titre de propriété');
    case 'LAND_CONCESSION':
      return t('Arrêté de concession définitive (ACD)');
    case 'NOTARIAL_DEED':
      return t('Acte notarié');
    case 'BUILDING_PERMIT':
      return t('Permis de construire');
    case 'PLAN':
      return t('Plan');
    case 'TECHNICAL_DIAGNOSIS':
      return t('Diagnostic technique');
    case 'INSURANCE':
      return t('Assurance');
    case 'TAX_DOCUMENT':
      return t('Document fiscal');
    case 'MANDATE':
      return t('Mandat');
    case 'SYNDICATE_PV':
      return t("Procès-verbal d'assemblée");
    case 'SYNDICATE_BUDGET':
      return t('Budget du syndicat');
    case 'SYNDICATE_CONTRAT':
      return t('Contrat du syndicat');
    case 'SYNDICATE_REGL_COPRO':
      return t('Règlement de copropriété');
    case 'OTHER':
      return t('Autre');
    default:
      return type;
  }
}

export function documentTypeOptions(): Array<{ value: string; label: string }> {
  return PATRIMONY_DOC_TYPES.map(type => ({ value: type, label: documentTypeLabel(type) }));
}

export function loanStatusLabel(status: PropertyLoan['status']): string {
  if (status === 'ACTIVE') return t('Actif');
  if (status === 'CLOSED') return t('Clôturé');
  if (status === 'DEFAULTED') return t('Défaillant');
  return status;
}

export function valuationMethodLabel(method: AssetValuation['method']): string {
  if (method === 'MANUAL') return t('Manuelle');
  if (method === 'MARKET_ESTIMATE') return t('Estimation de marché');
  if (method === 'EXPERT_APPRAISAL') return t('Expertise');
  return method;
}

export function expenseCategoryLabel(category: PropertyExpense['category']): string {
  if (category === 'PROPERTY_TAX') return t('Taxe foncière');
  if (category === 'CONDO_FEES') return t('Charges de copropriété');
  if (category === 'INSURANCE') return t('Assurance');
  if (category === 'ROUTINE_MAINTENANCE') return t('Entretien courant');
  if (category === 'RENOVATION') return t('Rénovation');
  if (category === 'MANAGEMENT_FEES') return t('Honoraires de gestion');
  if (category === 'UTILITIES') return t('Charges communes');
  if (category === 'OTHER') return t('Autre');
  return category;
}

export const EXPENSE_RECURRENCES: readonly ExpenseRecurrence[] = ['ONE_OFF', 'MONTHLY', 'QUARTERLY', 'ANNUAL'];

export function expenseRecurrenceLabel(recurrence: ExpenseRecurrence | null | undefined): string {
  if (recurrence === 'MONTHLY') return t('Mensuelle');
  if (recurrence === 'QUARTERLY') return t('Trimestrielle');
  if (recurrence === 'ANNUAL') return t('Annuelle');
  return t('Ponctuelle');
}

/**
 * Devise des montants du patrimoine qui n'en portent pas (rendement,
 * plus-value, total des charges). La devise de l'agence n'est pas exposée au
 * navigateur : le franc CFA est celle de toutes les agences déployées.
 */
export const DEVISE_PATRIMOINE = 'XOF';

/**
 * Message d'une erreur d'API : `error` (alias historique) ou `message`,
 * sinon le repli fourni. Jamais d'erreur avalée en silence.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (typeof data?.error === 'string' && data.error) return data.error;
  if (typeof data?.message === 'string' && data.message) return data.message;
  return fallback;
}
