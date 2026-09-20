import React from 'react';
import { Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { MaintenanceContract } from '../../types/syndic-types';
import { contractStatusLabels } from './labels';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text } = Typography;

const statusColor: Record<MaintenanceContract['status'], string> = {
  ACTIVE: 'green',
  EXPIRED: 'red',
  TERMINATED: 'default'
};

interface ContractListProps {
  contracts: MaintenanceContract[];
  loading?: boolean;
}

export const ContractList: React.FC<ContractListProps> = ({ contracts, loading = false }) => {
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
      render: (_: unknown, item) =>
        item.annualAmount
          ? `${Number(item.annualAmount).toLocaleString(activeLocale())} ${item.currency}`
          : t('Non renseigné')
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

  return (
    <Table
      scroll={{ x: 'max-content' }}
      rowKey="id"
      dataSource={contracts}
      columns={columns}
      loading={loading}
      pagination={{ pageSize: 8, hideOnSinglePage: true }}
      locale={{ emptyText: 'Aucun contrat de maintenance' }}
    />
  );
};
