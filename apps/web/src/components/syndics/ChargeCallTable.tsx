import React from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import { FilePdfOutlined, FileWordOutlined, LinkOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { MoneyValue } from '../primitives/MoneyValue';
import { Table } from '../primitives';
import { ChargeCall, ChargeCallStatus } from '../../types/syndic-types';
import { formatLotLabel } from '../../utils/syndic-lot-label';
import { ChargeCallPaymentLinkButton } from './ChargeCallPaymentLinkButton';
import { t } from '../../i18n/t';

const { Text } = Typography;

/** Libellé et couleur d'un statut d'appel de charges, partagés avec la modale de paiement par lot. */
export const chargeCallStatusConfig: Record<ChargeCallStatus, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: t('En attente') },
  PARTIAL: { color: 'blue', label: t('Partiel') },
  PAID: { color: 'green', label: t('Payé') },
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

/** Lot S2 : préfère les totaux calculés côté API (affectations) au repli sur `payments[]`. */
function computePaidAmount(item: ChargeCall): number {
  if (item.paidAmount !== undefined) return Number(item.paidAmount);
  return (item.payments || []).reduce((sum, payment) => sum + Number(payment.amount), 0);
}

function computeOutstandingAmount(item: ChargeCall): number {
  if (item.outstandingAmount !== undefined) return Number(item.outstandingAmount);
  return Math.max(0, Number(item.amount) - computePaidAmount(item));
}

/** Lien « Payer cet appel » (spec 042) : droits de l'écran et ouverture de la liste des liens. */
export interface ChargeCallPaymentLinkActions {
  tenantId: string;
  syndicId: string;
  /** `SYNDIC_EDIT` : bouton « Payer cet appel ». */
  canCreate: boolean;
  /** `SYNDIC_VIEW` : bouton « Liens de paiement ». */
  canView: boolean;
  /** Ouvre le panneau des liens de l'appel. */
  onOpenLinks: (charge: ChargeCall) => void;
  /** Appelé après un envoi ou une création réussis. */
  onChanged?: () => void;
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
  /** Callback pour l'action « Avis d'appel (PDF) » (lot S4). Optionnel, même règle que ci-dessus. */
  onDownloadNotice?: (charge: ChargeCall) => void;
  onDownloadNoticeWord?: (charge: ChargeCall) => void;
  /**
   * Fonds de la copropriété : quand la liste est fournie, une colonne « Fonds »
   * affiche le fonds qui reçoit en entier ce qui est payé sur l'appel.
   */
  funds?: Array<{ id: string; name: string }>;
  /** Callback pour l'action « Affecter à un fonds ». Optionnel, même règle que les autres actions. */
  onAssignFund?: (charge: ChargeCall) => void;
  /** Actions du lien de paiement mobile ; absent : aucune de ces actions n'est affichée. */
  paymentLinks?: ChargeCallPaymentLinkActions;
}

export const ChargeCallTable: React.FC<ChargeCallTableProps> = ({
  items,
  loading = false,
  onRecordPayment,
  onDownloadNotice,
  onDownloadNoticeWord,
  funds,
  onAssignFund,
  paymentLinks
}) => {
  const fundNames = new Map((funds || []).map(fund => [fund.id, fund.name]));
  const columns: ColumnsType<ChargeCall> = [
    {
      title: t('Période'),
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
      exportValue: (item: ChargeCall) => Number(item.amount),
      render: (_: unknown, item: ChargeCall) => <MoneyValue value={item.amount} />
    },
    {
      title: t('Échéance'),
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
      exportValue: (item: ChargeCall) => computePaidAmount(item),
      render: (_: unknown, item: ChargeCall) => <MoneyValue value={computePaidAmount(item)} />
    },
    {
      title: t('Reste'),
      key: 'outstanding',
      align: 'end',
      exportValue: (item: ChargeCall) => computeOutstandingAmount(item),
      render: (_: unknown, item: ChargeCall) => <MoneyValue value={computeOutstandingAmount(item)} />
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (value: ChargeCallStatus) => {
        const config = chargeCallStatusConfig[value];
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    ...(funds
      ? [
          {
            title: t('Fonds'),
            key: 'fund',
            render: (_: unknown, item: ChargeCall) =>
              item.fundId ? (fundNames.get(item.fundId) ?? t('Fonds')) : <Text type="secondary">—</Text>
          }
        ]
      : []),
    ...(onRecordPayment || onDownloadNotice || onDownloadNoticeWord || onAssignFund || paymentLinks
      ? [
          {
            title: t('Actions'),
            key: 'actions',
            render: (_: unknown, item: ChargeCall) => (
              <Space size={8} wrap>
                {onRecordPayment ? (
                  <Button size="small" disabled={item.status === 'PAID'} onClick={() => onRecordPayment(item)}>
                    {t('Enregistrer un paiement')}
                  </Button>
                ) : null}
                {onDownloadNotice ? (
                  <Button size="small" icon={<FilePdfOutlined />} onClick={() => onDownloadNotice(item)}>
                    {t("Avis d'appel (PDF)")}
                  </Button>
                ) : null}
                {onDownloadNoticeWord ? (
                  <Button size="small" icon={<FileWordOutlined />} onClick={() => onDownloadNoticeWord(item)}>
                    {t("Avis d'appel (Word)")}
                  </Button>
                ) : null}
                {onAssignFund ? (
                  <Button size="small" onClick={() => onAssignFund(item)}>
                    {t('Affecter à un fonds')}
                  </Button>
                ) : null}
                {paymentLinks ? (
                  <>
                    <ChargeCallPaymentLinkButton
                      size="small"
                      tenantId={paymentLinks.tenantId}
                      syndicId={paymentLinks.syndicId}
                      chargeId={item.id}
                      remaining={computeOutstandingAmount(item)}
                      status={item.status}
                      canCreate={paymentLinks.canCreate}
                      periodLabel={item.period}
                      onChanged={paymentLinks.onChanged}
                    />
                    {paymentLinks.canView ? (
                      <Button size="small" icon={<LinkOutlined />} onClick={() => paymentLinks.onOpenLinks(item)}>
                        {t('Liens de paiement')}
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </Space>
            )
          }
        ]
      : [])
  ];

  return (
    <Table
      exportFilename={t('Appels de charges')}
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
