import React from 'react';
import { Button, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { MoneyValue } from '../primitives/MoneyValue';
import { ChargeCall, ChargeCallStatus } from '../../types/syndic-types';
import { formatLotLabel } from '../../utils/syndic-lot-label';
import { t } from '../../i18n/t';

const { Text } = Typography;

const statusConfig: Record<ChargeCallStatus, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: t('En attente') },
  PARTIAL: { color: 'blue', label: t('Partiel') },
  PAID: { color: 'green', label: t('Paye') },
  OVERDUE: { color: 'red', label: t('En retard') }
};

function buildLotLabel(item: ChargeCall): string {
  return formatLotLabel(item.lot, item.lotId);
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

function computePaidAmount(item: ChargeCall): number {
  return (item.payments || []).reduce((sum, payment) => sum + Number(payment.amount), 0);
}

function computeOutstandingAmount(item: ChargeCall): number {
  return Math.max(0, Number(item.amount) - computePaidAmount(item));
}

interface ChargeCallTableProps {
  items: ChargeCall[];
  loading?: boolean;
  /**
   * Callback pour l'action « Enregistrer un paiement » (FR-005). Optionnel :
   * quand il n'est pas fourni, la colonne Actions ne s'affiche pas, pour que
   * ce composant reste utilisable en lecture seule ailleurs.
   */
  onRecordPayment?: (charge: ChargeCall) => void;
}

export const ChargeCallTable: React.FC<ChargeCallTableProps> = ({ items, loading = false, onRecordPayment }) => {
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
      align: 'end',
      render: (_: unknown, item: ChargeCall) => <MoneyValue value={item.amount} />
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
      title: t('Payé'),
      key: 'paid',
      align: 'end',
      render: (_: unknown, item: ChargeCall) => <MoneyValue value={computePaidAmount(item)} />
    },
    {
      title: t('Reste'),
      key: 'outstanding',
      align: 'end',
      render: (_: unknown, item: ChargeCall) => <MoneyValue value={computeOutstandingAmount(item)} />
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (value: ChargeCallStatus) => {
        const config = statusConfig[value];
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    ...(onRecordPayment
      ? [
          {
            title: t('Actions'),
            key: 'actions',
            render: (_: unknown, item: ChargeCall) => (
              <Button size="small" disabled={item.status === 'PAID'} onClick={() => onRecordPayment(item)}>
                {t('Enregistrer un paiement')}
              </Button>
            )
          }
        ]
      : [])
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={items}
      loading={loading}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
      locale={{ emptyText: 'Aucun appel de charges' }}
      scroll={{ x: 1200 }}
    />
  );
};
