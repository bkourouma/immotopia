import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StateBlock } from '../../../components/primitives';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { t } from '../../../i18n/t';

const ONGLETS_BAIL = ['info', 'renters', 'installments', 'payments', 'balance', 'deposit'];

/** Onglets du détail d'un bail, pilotés par `?tab=` ; un onglet masqué est démonté. */
export function useLeaseTabs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const ongletParam = searchParams.get('tab');
  const activeKey = ongletParam && ONGLETS_BAIL.includes(ongletParam) ? ongletParam : 'info';
  const onChange = (cle: string) =>
    setSearchParams(
      precedent => {
        const suivant = new URLSearchParams(precedent);
        suivant.set('tab', cle);
        return suivant;
      },
      { replace: true }
    );
  return { activeKey, onChange, destroyOnHidden: true };
}

interface InstallmentRow {
  period_year: number;
  period_month: number;
  status: string;
  due_date: string;
}

interface PaymentRow {
  method: string;
  succeeded_at: string;
  allocations: Array<{ installment: { period_year: number; period_month: number } | null }>;
}

const periodeLabel = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

// Stables : déclarés HORS du hook (le filtrage local reste mémoïsé).
const TEXTE_ECHEANCES = [(row: InstallmentRow) => periodeLabel(row.period_year, row.period_month)];
const ACCESSEURS_ECHEANCES = {
  statut: (row: InstallmentRow) => row.status,
  echeance: (row: InstallmentRow) => row.due_date
};
const ACCESSEURS_PAIEMENTS = {
  methode: (row: PaymentRow) => row.method,
  date: (row: PaymentRow) => row.succeeded_at
};
const METHODES_PAIEMENT = ['CASH', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY', 'DIRECT_DEBIT', 'CARD', 'OTHER'];

/**
 * Recherche locale des onglets « Échéances » (préfixe `ech`) et « Historique
 * des paiements » (préfixe `pai`). `methodLabel` reste celui de l'écran.
 */
export function useLeaseDetailsSearch<T extends InstallmentRow, P extends PaymentRow>(
  data: { installments: T[]; paymentHistory: P[] } | null,
  methodLabel: (method: string) => string
) {
  const installmentCriteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Période…') },
    {
      key: 'statut',
      type: 'multiSelect',
      label: t('Statut'),
      primary: true,
      options: [
        { value: 'DRAFT', label: t('Brouillon') },
        { value: 'DUE', label: t('Échéance') },
        { value: 'PARTIAL', label: t('Partiel') },
        { value: 'PAID', label: t('Payé') },
        { value: 'OVERDUE', label: t('En retard') }
      ]
    },
    { key: 'echeance', type: 'dateRange', label: t('Échéance'), primary: true }
  ];
  const installments = useLocalListSearch<T>(data?.installments, {
    paramPrefix: 'ech',
    criteria: installmentCriteria,
    text: TEXTE_ECHEANCES,
    accessors: ACCESSEURS_ECHEANCES
  });

  const textePaiements = useMemo(
    () => [
      (row: P) => methodLabel(row.method),
      (row: P) =>
        row.allocations.map(allocation =>
          allocation.installment
            ? periodeLabel(allocation.installment.period_year, allocation.installment.period_month)
            : ''
        )
    ],
    [methodLabel]
  );
  const paymentCriteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Méthode, période…') },
    {
      key: 'methode',
      type: 'multiSelect',
      label: t('Méthode'),
      primary: true,
      options: METHODES_PAIEMENT.map(value => ({ value, label: methodLabel(value) }))
    },
    { key: 'date', type: 'dateRange', label: t('Date'), primary: true }
  ];
  const payments = useLocalListSearch<P>(data?.paymentHistory, {
    paramPrefix: 'pai',
    criteria: paymentCriteria,
    text: textePaiements,
    accessors: ACCESSEURS_PAIEMENTS
  });

  return {
    installmentsSearch: {
      ...installments,
      search: { ...installments.searchProps, 'aria-label': t('Rechercher dans les échéances') }
    },
    paymentsSearch: {
      ...payments,
      search: { ...payments.searchProps, 'aria-label': t('Rechercher dans les paiements') }
    }
  };
}

interface PagedLike {
  page: number;
  pageSize: number;
  total: number;
  dataViewProps: { onPageChange: (page: number, pageSize: number) => void };
}

/** Pagination antd d'une `List` alimentée par une recherche locale. */
export function listPagination(local: PagedLike) {
  return {
    current: local.page,
    pageSize: local.pageSize,
    total: local.total,
    onChange: local.dataViewProps.onPageChange,
    showSizeChanger: true,
    hideOnSinglePage: true
  };
}

/** Contenu d'une liste dont les critères actifs ne laissent aucun résultat. */
export function noResults(clear: () => void): ReactNode {
  return (
    <StateBlock variant="no-results" actions={[{ label: t('Effacer les critères'), onClick: clear, primary: true }]} />
  );
}
