import React, { useMemo } from 'react';
import { Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { MoneyValue } from '../primitives/MoneyValue';
import { Table } from '../primitives';
import { MaintenanceContract } from '../../types/syndic-types';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { contractStatusLabels } from './labels';
import { LinkedProviderInvoices } from './LinkedProviderInvoices';
import { t } from '../../i18n/t';

const { Text } = Typography;

const statusColor: Record<MaintenanceContract['status'], string> = {
  ACTIVE: 'green',
  EXPIRED: 'red',
  TERMINATED: 'default'
};

// Accesseurs stables (hors du composant) : le filtrage reste mémoïsé.
const TEXTE_RECHERCHE = [
  (item: MaintenanceContract) => item.provider?.name,
  (item: MaintenanceContract) => item.nature
];
const ACCESSEURS = {
  status: (item: MaintenanceContract) => item.status,
  provider: (item: MaintenanceContract) => item.providerId,
  start: (item: MaintenanceContract) => item.startDate,
  end: (item: MaintenanceContract) => item.endDate,
  amount: (item: MaintenanceContract) => (item.annualAmount ? Number(item.annualAmount) : undefined)
};
const STATUSES: Array<MaintenanceContract['status']> = ['ACTIVE', 'EXPIRED', 'TERMINATED'];

interface ContractListProps {
  contracts: MaintenanceContract[];
  loading?: boolean;
  /**
   * Agence et copropriété : quand les deux sont fournis, chaque ligne
   * s'étend sur ses « Factures liées » (lot S6). Absents, le tableau reste
   * celui d'avant S6 — les appelants qui n'en ont pas besoin ne changent pas.
   */
  tenantId?: string;
  syndicId?: string;
}

export const ContractList: React.FC<ContractListProps> = ({ contracts, loading = false, tenantId, syndicId }) => {
  const renewalWindowDays = 45;

  // Prestataires présents dans la liste : la liste arrive en entier (bornée par la copropriété).
  const providerOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const contract of contracts) byId.set(contract.providerId, contract.provider?.name || contract.providerId);
    return Array.from(byId, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label, 'fr')
    );
  }, [contracts]);

  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Prestataire, nature du contrat…') },
    {
      key: 'status',
      type: 'multiSelect',
      label: t('Statut'),
      primary: true,
      options: STATUSES.map(value => ({ value, label: contractStatusLabels[value] }))
    },
    { key: 'provider', type: 'select', label: t('Prestataire'), primary: true, options: providerOptions },
    { key: 'end', type: 'dateRange', label: t('Fin du contrat') },
    { key: 'start', type: 'dateRange', label: t('Début du contrat') },
    { key: 'amount', type: 'numberRange', label: t('Montant annuel'), unit: 'FCFA' }
  ];
  const local = useLocalListSearch<MaintenanceContract>(contracts, {
    paramPrefix: 'ct',
    ariaLabel: t('Rechercher dans les contrats'),
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  const columns: ColumnsType<MaintenanceContract> = [
    { title: t('Prestataire'), key: 'provider', render: (_: unknown, item) => item.provider?.name || item.providerId },
    { title: t('Nature'), dataIndex: 'nature', key: 'nature', render: (value: string) => <Text strong>{value}</Text> },
    {
      title: t('Début'),
      dataIndex: 'startDate',
      key: 'startDate',
      render: (value: string) => dayjs(value).format('DD/MM/YYYY')
    },
    {
      title: t('Fin'),
      dataIndex: 'endDate',
      key: 'endDate',
      render: (value?: string | null) => {
        if (!value) return t('Sans fin');
        const expiringSoon = dayjs(value).isBefore(dayjs().add(renewalWindowDays, 'day'));
        return <Text type={expiringSoon ? 'warning' : undefined}>{dayjs(value).format('DD/MM/YYYY')}</Text>;
      }
    },
    {
      title: t('Montant annuel'),
      key: 'annualAmount',
      align: 'end',
      exportValue: (item: MaintenanceContract) => (item.annualAmount ? Number(item.annualAmount) : null),
      render: (_: unknown, item) => (item.annualAmount ? <MoneyValue value={item.annualAmount} /> : t('Non renseigné'))
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (value: MaintenanceContract['status']) => (
        <Tag color={statusColor[value]}>{contractStatusLabels[value]}</Tag>
      )
    }
  ];

  const showLinkedInvoices = Boolean(tenantId && syndicId);

  return (
    <Table
      {...local.tableProps}
      helpId="syndic.prestataires.contrats"
      aria-label={t('Contrats de maintenance')}
      exportFilename={t('Contrats de maintenance')}
      exportFetchAll={local.exportAll}
      scroll={{ x: 'max-content' }}
      rowKey="id"
      columns={columns}
      loading={loading}
      locale={local.isFiltered ? undefined : { emptyText: t('Aucun contrat de maintenance') }}
      expandable={
        showLinkedInvoices
          ? {
              expandedRowRender: contract => (
                <LinkedProviderInvoices tenantId={tenantId!} syndicId={syndicId!} contractId={contract.id} />
              )
            }
          : undefined
      }
    />
  );
};
