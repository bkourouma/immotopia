import type { SearchCriterion } from '../../utils/list-search';
import { t } from '../../i18n/t';
import { INVOICE_NATURE_LABEL, INVOICE_STATUS_LABEL } from './platform-invoice-labels';

/**
 * Critères de recherche des factures d'abonnement (super-admin et agence).
 * À appeler DANS le corps du composant (libellés traduits au rendu). L'agence
 * ne voit jamais les brouillons : `withDrafts: false`.
 */
export function platformInvoiceCriteria(withDrafts: boolean): SearchCriterion[] {
  const statuses = ['DRAFT', 'ISSUED', 'OVERDUE', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED'].filter(
    status => withDrafts || status !== 'DRAFT'
  );
  return [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Numéro de facture, référence de paiement…')
    },
    {
      key: 'status',
      type: 'multiSelect',
      label: t('Statut'),
      primary: true,
      options: statuses.map(value => ({ value, label: INVOICE_STATUS_LABEL[value]?.label ?? value }))
    },
    { key: 'period', type: 'dateRange', label: t("Date d'émission"), primary: true, api: ['from', 'to'] },
    {
      key: 'nature',
      type: 'multiSelect',
      label: t('Nature'),
      options: ['PERIOD', 'OVERAGE', 'CREDIT_NOTE'].map(value => ({
        value,
        label: INVOICE_NATURE_LABEL[value] ?? value
      }))
    },
    {
      key: 'amount',
      type: 'numberRange',
      label: t('Montant TTC'),
      unit: 'FCFA',
      api: ['minAmount', 'maxAmount']
    }
  ];
}
