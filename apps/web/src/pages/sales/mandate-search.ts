/**
 * Recherche locale des mandats de vente, partagée par « Mandats de vente »
 * (`SaleMandates`) et « Tableau des ventes » (`SalesDashboard`).
 *
 * L'API renvoie les mandats d'un bloc (500 au plus, sans pagination) : le
 * filtrage et la pagination se font ici (`useLocalListSearch`). Les accesseurs
 * sont des constantes de module (identité stable, filtrage mémoïsé) ; les
 * critères, eux, passent par des fonctions pour que leurs libellés suivent la
 * langue.
 */
import type { SearchCriterion } from '../../utils/list-search';
import type { SaleMandateDto } from '../../services/sales-service';
import { localizedList } from '../../i18n/localized';
import { t } from '../../i18n/t';
import { MANDATE_TYPE_LABELS } from './helpers';

/** Plafond de la liste renvoyée par l'API (`take: 500`) : au plafond, l'écran le dit. */
export const MANDATES_LIMIT = 500;

const STATUS_OPTIONS = localizedList(() => [
  { value: 'ACTIVE', label: t('Actif') },
  { value: 'REVOKED', label: t('Révoqué') },
  { value: 'COMPLETED', label: t('Terminé') }
]);

const TYPE_OPTIONS = localizedList(() => [
  { value: 'SIMPLE', label: t('Simple') },
  { value: 'EXCLUSIVE', label: t('Exclusif') }
]);

/** Champ libre : numéro, bien, vendeur, négociateur et type de mandat tel qu'affiché. */
export const MANDATE_TEXT = [
  (m: SaleMandateDto) => m.number,
  (m: SaleMandateDto) => m.propertyLabel,
  (m: SaleMandateDto) => m.sellerName,
  (m: SaleMandateDto) => m.agentName,
  (m: SaleMandateDto) => MANDATE_TYPE_LABELS[m.mandateType]
];

export const MANDATE_ACCESSORS = {
  status: (m: SaleMandateDto) => m.status,
  type: (m: SaleMandateDto) => m.mandateType,
  start: (m: SaleMandateDto) => m.startDate,
  end: (m: SaleMandateDto) => m.endDate,
  price: (m: SaleMandateDto) => m.askingPrice,
  expired: (m: SaleMandateDto) => m.isExpired && m.status === 'ACTIVE'
};

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
    { key: 'price', type: 'numberRange', label: t('Prix demandé'), unit: 'FCFA' },
    { key: 'expired', type: 'boolean', label: t('Échéance dépassée') }
  ];
}
