import React from 'react';
import { Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { ChargeCall, ChargeCallStatus } from '../../types/syndic-types';

const { Text } = Typography;

const statusConfig: Record<ChargeCallStatus, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: 'En attente' },
  PARTIAL: { color: 'blue', label: 'Partiel' },
  PAID: { color: 'green', label: 'Paye' },
  OVERDUE: { color: 'red', label: 'En retard' },
};

function buildLotLabel(item: ChargeCall): string {
  const property = item.lot?.property;
  if (!property) {
    return item.lot?.lotNumber || item.lotId;
  }

  const ownerLabel = property.owner?.fullName?.trim() || '';
  const title = property.title?.trim() || property.internalReference || property.id;
  return ownerLabel ? `${ownerLabel} - ${title}` : title;
}

function recurrenceLabel(item: ChargeCall): string {
  if (!item.isRecurring) return 'Non';

  const frequencyMap: Record<'MONTHLY' | 'QUARTERLY' | 'ANNUAL', string> = {
    MONTHLY: 'Mensuelle',
    QUARTERLY: 'Trimestrielle',
    ANNUAL: 'Annuelle',
  };
  const frequency = item.recurrenceFrequency ? frequencyMap[item.recurrenceFrequency] : 'Recurrente';
  const occurrences = item.recurrenceCount ? ` (${item.recurrenceCount} occ.)` : '';
  return `Oui - ${frequency}${occurrences}`;
}

interface ChargeCallTableProps {
  items: ChargeCall[];
  loading?: boolean;
}

export const ChargeCallTable: React.FC<ChargeCallTableProps> = ({ items, loading = false }) => {
  const columns: ColumnsType<ChargeCall> = [
    {
      title: 'Periode',
      dataIndex: 'period',
      key: 'period',
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: 'Lot',
      dataIndex: ['lot', 'lotNumber'],
      key: 'lotNumber',
      render: (_: unknown, item: ChargeCall) => buildLotLabel(item),
    },
    {
      title: 'Montant',
      key: 'amount',
      render: (_: unknown, item: ChargeCall) =>
        `${Number(item.amount).toLocaleString('fr-FR')} ${item.currency}`,
    },
    {
      title: 'Echeance',
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (value: string, item: ChargeCall) => {
        const isLate = dayjs(value).isBefore(dayjs(), 'day') && item.status !== 'PAID';
        return (
          <Text type={isLate ? 'danger' : undefined}>
            {dayjs(value).format('DD/MM/YYYY')}
          </Text>
        );
      },
    },
    {
      title: 'Charge récurrente',
      key: 'isRecurring',
      render: (_: unknown, item: ChargeCall) => recurrenceLabel(item),
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (value: ChargeCallStatus) => {
        const config = statusConfig[value];
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={items}
      loading={loading}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
      locale={{ emptyText: 'Aucun appel de charges' }}
      scroll={{ x: 920 }}
    />
  );
};

