import React from 'react';
import { Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { MoneyValue } from '../primitives/MoneyValue';
import { MaintenanceContract } from '../../types/syndic-types';
import { contractStatusLabels } from './labels';
import { LinkedProviderInvoices } from './LinkedProviderInvoices';
import { t } from '../../i18n/t';

const { Text } = Typography;

const statusColor: Record<MaintenanceContract['status'], string> = {
  ACTIVE: 'green',
  EXPIRED: 'red',
  TERMINATED: 'default'
};

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
      scroll={{ x: 'max-content' }}
      rowKey="id"
      dataSource={contracts}
      columns={columns}
      loading={loading}
      pagination={{ pageSize: 8, hideOnSinglePage: true }}
      locale={{ emptyText: 'Aucun contrat de maintenance' }}
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
