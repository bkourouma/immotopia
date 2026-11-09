/**
 * Recherche des mandats de vente, partagée par « Mandats de vente »
 * (`SaleMandates`) et « Tableau des ventes » (`SalesDashboard`).
 *
 * Les critères sont traduits en paramètres de l'API avant pagination.
 */
import type { SearchCriterion } from '../../utils/list-search';
import { localizedList } from '../../i18n/localized';
import { t } from '../../i18n/t';

const STATUS_OPTIONS = localizedList(() => [
  { value: 'ACTIVE', label: t('Actif') },
  { value: 'REVOKED', label: t('Révoqué') },
  { value: 'COMPLETED', label: t('Terminé') }
]);

const TYPE_OPTIONS = localizedList(() => [
  { value: 'SIMPLE', label: t('Simple') },
  { value: 'EXCLUSIVE', label: t('Exclusif') }
]);

/**
 * Critères de la liste complète : champ libre, statut et type en ligne ; début,
 * échéance, prix demandé et « échéance dépassée » sous « Plus de critères ».
 * `withStatus: false` (tableau de bord : tous les mandats sont actifs) retire le
 * statut et le remplace, en ligne, par l'échéance.
 */
export function mandateCriteria(options: { withStatus: boolean }): SearchCriterion[] {
  return [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Numéro, bien, vendeur, négociateur…')
    },
    ...(options.withStatus
      ? ([
          {
            key: 'status',
            type: 'multiSelect',
            label: t('Statut'),
            primary: true,
            options: STATUS_OPTIONS
          }
        ] as SearchCriterion[])
      : []),
    { key: 'type', type: 'multiSelect', label: t('Type de mandat'), primary: true, options: TYPE_OPTIONS },
    { key: 'end', type: 'dateRange', label: t('Échéance'), primary: !options.withStatus },
    { key: 'start', type: 'dateRange', label: t('Début du mandat') },
    { key: 'price', type: 'numberRange', label: t('Prix demandé'), unit: 'FCFA', api: ['minPrice', 'maxPrice'] },
    { key: 'expired', type: 'boolean', label: t('Échéance dépassée') }
  ];
}
