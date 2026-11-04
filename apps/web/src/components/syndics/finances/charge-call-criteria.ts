import { chargeCallStatusConfig } from '../ChargeCallTable';
import { t } from '../../../i18n/t';
import type { SearchCriterion, SearchOption } from '../../../utils/list-search';

const CHARGE_CALL_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE'] as const;

/**
 * Critères de la liste des appels de charges (`GET …/charges`, paginée par le
 * serveur), partagés par l'écran Charges et l'onglet « appels de fonds » des
 * Finances. À appeler dans le corps du composant (libellés vivants).
 *
 * Pas de critère « Période » : l'API la compare en égalité stricte sur un
 * libellé libre (`2026-T1`, `2026-03-R2`…) dont la liste n'est pas connue ; le
 * champ libre, lui, cherche déjà la période par « contient ».
 */
export function chargeCallCriteria(lotOptions: readonly SearchOption[]): SearchCriterion[] {
  return [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Période, libellé, lot, copropriétaire…')
    },
    {
      key: 'status',
      type: 'multiSelect',
      label: t('Statut'),
      primary: true,
      options: CHARGE_CALL_STATUSES.map(value => ({ value, label: chargeCallStatusConfig[value].label }))
    },
    {
      key: 'lotId',
      type: 'select',
      label: t('Lot'),
      primary: true,
      options: lotOptions,
      placeholder: t('Tous les lots')
    }
  ];
}
