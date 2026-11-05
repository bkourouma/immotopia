/**
 * Critères de recherche de la liste des paiements (écran Paiements et onglet
 * Paiements d'un bail). Guide : `docs/architecture/recherche-listes.md`.
 *
 * Fonction et non constante : les libellés passent par `t()` au rendu.
 * Dans l'onglet d'un bail (`leaseId` fourni), le locataire est unique : pas de
 * critère locataire.
 */
import type { SearchCriterion } from '../../utils/list-search';
import { renterCriterion } from './rental-search-criteria';
import { t } from '../../i18n/t';

/** Statuts d'un paiement (valeurs de l'API). */
export function paymentStatusOptions() {
  return [
    { value: 'PENDING', label: t('En attente') },
    { value: 'SUCCESS', label: t('Réussi') },
    { value: 'FAILED', label: t('Échoué') },
    { value: 'CANCELED', label: t('Annulé') }
  ];
}

/** Moyens de paiement (valeurs de l'API). */
export function paymentMethodOptions() {
  return [
    { value: 'CASH', label: t('Espèces') },
    { value: 'BANK_TRANSFER', label: t('Virement bancaire') },
    { value: 'CHECK', label: t('Chèque') },
    { value: 'MOBILE_MONEY', label: t('Mobile Money') },
    { value: 'DIRECT_DEBIT', label: t('Prélèvement bancaire') },
    { value: 'CARD', label: t('Carte bancaire') },
    { value: 'OTHER', label: t('Autre') }
  ];
}

export function paymentCriteria(tenantId: string | undefined, leaseId?: string): SearchCriterion[] {
  return [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Référence, n° de bail, bien, locataire…')
    },
    {
      key: 'status',
      type: 'select',
      label: t('Statut'),
      placeholder: t('Tous les statuts'),
      primary: true,
      options: paymentStatusOptions()
    },
    {
      key: 'periode',
      type: 'dateRange',
      label: t('Période'),
      primary: true,
      api: ['startDate', 'endDate']
    },
    ...(leaseId ? [] : [renterCriterion(tenantId, { api: 'renterClientId' })]),
    {
      key: 'method',
      type: 'select',
      label: t('Méthode'),
      placeholder: t('Toutes les méthodes'),
      options: paymentMethodOptions()
    },
    {
      key: 'montant',
      type: 'numberRange',
      label: t('Montant'),
      unit: 'FCFA',
      api: ['minAmount', 'maxAmount']
    }
  ];
}
