import React from 'react';
import { Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { ChargeCall, ChargeCallStatus } from '../../types/syndic-types';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text } = Typography;

function statusConfig(): Record<ChargeCallStatus, { color: string; label: string }> {
  return {
    PENDING: { color: 'gold', label: t('En attente') },
    PARTIAL: { color: 'blue', label: t('Partiel') },
    PAID: { color: 'green', label: t('Paye') },
    OVERDUE: { color: 'red', label: t('En retard') }
  };
}

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
    ANNUAL: 'Annuelle'
  };
  const frequency = item.recurrenceFrequency ? frequencyMap[item.recurrenceFrequency] : 'Recurrente';
  const occurrences = item.recurrenceCount ? ` (${item.recurrenceCount} occ.)` : '';
  return t('Oui - {{frequency}}{{occurrences}}', { frequency: frequency, occurrences: occurrences });
}

interface ChargeCallTableProps {
  items: ChargeCall[];
  loading?: boolean;
}

export const ChargeCallTable: React.FC<ChargeCallTableProps> = ({ items, loading = false }) => {
  const columns: ColumnsType<ChargeCall> = [
    {
      title: t('Periode'),
      dataIndex: 'period',
      key: 'period',
      render: (value: string) => <Text strong>{value}</Text>
    },
    {
      title: t('Lot'),
      dataIndex: ['lot', 'lotNumber'],
      key: 'lotNumber',
      render: (_: unknown, item: ChargeCall) => buildLotLabel(item)
    },
    {
      title: t('Montant'),
      key: 'amount',
      render: (_: unknown, item: ChargeCall) => `${Number(item.amount).toLocaleString(activeLocale())} ${item.currency}`
    },
    {
      title: t('Echeance'),
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (value: string, item: ChargeCall) => {
        const isLate = dayjs(value).isBefore(dayjs(), 'day') && item.status !== 'PAID';
        return <Text type={isLate ? 'danger' : undefined}>{dayjs(value).format('DD/MM/YYYY')}</Text>;
      }
    },
    {
      title: t('Charge récurrente'),
      key: 'isRecurring',
      render: (_: unknown, item: ChargeCall) => recurrenceLabel(item)
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (value: ChargeCallStatus) => {
        const config = statusConfig()[value];
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    }
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
