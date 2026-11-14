import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { MoneyValue, Table } from '../../primitives';
import type { OverdueDashboardItem } from '../../../types/syndic-types';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { dateFormat } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { formatLotLabel } from '../../../utils/syndic-lot-label';
import { ownerLabel } from './recovery-labels';

/** Libellé du lot d'une ligne du tableau de bord des retards. */
export function overdueLotLabel(item: OverdueDashboardItem): string {
  return formatLotLabel({ lotNumber: item.lotNumber, property: item.property }, item.lotNumber);
}

// Accesseurs stables (hors du composant) : le filtrage reste mémoïsé.
const TEXTE_RECHERCHE = [
  (item: OverdueDashboardItem) => overdueLotLabel(item),
  (item: OverdueDashboardItem) => ownerLabel(item.owner),
  (item: OverdueDashboardItem) => item.owner?.email
];
const ACCESSEURS = {
  late: (item: OverdueDashboardItem) => item.daysLate,
  due: (item: OverdueDashboardItem) => item.dueDate,
  outstanding: (item: OverdueDashboardItem) => item.outstanding
};

interface OverdueTableTabProps {
  items: OverdueDashboardItem[];
  loading: boolean;
}

/**
 * Tableau des retards : le tableau de bord /retards (borné aux appels en
 * retard) arrive en entier, la recherche et la pagination se font en local
 * (préfixe d'URL « rt »).
 */
export const OverdueTableTab: React.FC<OverdueTableTabProps> = ({ items, loading }) => {
  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Lot, propriétaire…') },
    { key: 'late', type: 'numberRange', label: t('Jours de retard'), primary: true, unit: t('jours') },
    { key: 'due', type: 'dateRange', label: t('Échéance') },
    { key: 'outstanding', type: 'numberRange', label: t('Reste dû'), unit: 'FCFA' }
  ];

  const local = useLocalListSearch<OverdueDashboardItem>(items, {
    paramPrefix: 'rt',
    ariaLabel: t('Rechercher dans les retards'),
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  const columns: ColumnsType<OverdueDashboardItem> = [
    { title: t('Lot'), render: (_, item) => overdueLotLabel(item) },
    { title: t('Propriétaire'), render: (_, item) => ownerLabel(item.owner) },
    {
      title: t('Échéance'),
      dataIndex: 'dueDate',
      render: (value: string) => dayjs(value).format(dateFormat('short'))
    },
    { title: t('Jours retard'), dataIndex: 'daysLate' },
    {
      title: t('Montant'),
      dataIndex: 'amount',
      align: 'end',
      render: (value: number) => <MoneyValue value={value} />
    },
    {
      title: t('Payé'),
      dataIndex: 'paid',
      align: 'end',
      render: (value: number) => <MoneyValue value={value} />
    },
    {
      title: t('Reste'),
      dataIndex: 'outstanding',
      align: 'end',
      render: (value: number) => <MoneyValue value={value} />
    }
  ];

  return (
    <Table<OverdueDashboardItem>
      {...local.tableProps}
      aria-label={t('Tableau des retards')}
      helpId="syndic.recouvrement.retards"
      exportFilename={t('Tableau des retards')}
      exportFetchAll={local.exportAll}
      scroll={{ x: 'max-content' }}
      rowKey="chargeCallId"
      loading={loading}
      columns={columns}
      locale={local.isFiltered ? undefined : { emptyText: t('Aucun dossier en retard pour cette copropriété.') }}
    />
  );
};
