import React from 'react';
import { Modal, Descriptions, Table, Tag, Typography, Space } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text, Title } = Typography;

interface PaymentDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  payment: any;
  loading?: boolean;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(amount);
};

const getStatusTag = (status: string) => {
  const statusConfig: Record<string, { color: string; text: string }> = {
    PENDING: { color: 'default', text: t('En attente') },
    SUCCESS: { color: 'green', text: t('Réussi') },
    FAILED: { color: 'red', text: t('Échoué') },
    CANCELED: { color: 'orange', text: t('Annulé') }
  };

  const config = statusConfig[status] || { color: 'default', text: status };
  return <Tag color={config.color}>{config.text}</Tag>;
};

const getMethodLabel = (method: string) => {
  const methodLabels: Record<string, string> = {
    MOBILE_MONEY: t('Mobile Money'),
    BANK_TRANSFER: t('Virement bancaire'),
    CASH: t('Espèces'),
    CHECK: t('Chèque'),
    CARD: t('Carte bancaire')
  };
  return methodLabels[method] || method;
};

export const PaymentDetailsModal: React.FC<PaymentDetailsModalProps> = ({
  visible,
  onClose,
  payment,
  loading = false
}) => {
  if (!payment) {
    return null;
  }

  const allocationColumns = [
    {
      title: t('Échéance'),
      key: 'installment',
      render: (record: any) => {
        const inst = record.installment;
        if (!inst) return '-';
        const period = `${inst.period_month.toString().padStart(2, '0')}/${inst.period_year}`;
        return t('Échéance {{period}}', { period: period });
      }
    },
    {
      title: t('Propriété'),
      key: 'property',
      render: (record: any) => {
        return record.installment?.lease?.property?.address || '-';
      }
    },
    {
      title: t('Montant alloué'),
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => formatCurrency(Number(amount))
    }
  ];

  return (
    <Modal
      title={
        <Space>
          <DollarOutlined />
          <span>{t('Détails du paiement')}</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Payment Information */}
        <div>
          <Title level={4}>{t('Informations du paiement')}</Title>
          <Descriptions bordered column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label={t('Montant')}>
              <Text strong>{formatCurrency(Number(payment.amount))}</Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('Statut')}>{getStatusTag(payment.status)}</Descriptions.Item>
            <Descriptions.Item label={t('Méthode')}>{getMethodLabel(payment.method)}</Descriptions.Item>
            <Descriptions.Item label={t('Date')}>
              {payment.succeeded_at
                ? dayjs(payment.succeeded_at).format('DD/MM/YYYY HH:mm')
                : payment.initiated_at
                  ? dayjs(payment.initiated_at).format('DD/MM/YYYY HH:mm')
                  : '-'}
            </Descriptions.Item>
            {payment.lease?.property && (
              <Descriptions.Item label={t('Propriété')}>{payment.lease.property.address}</Descriptions.Item>
            )}
            {payment.lease?.primary_renter?.user && (
              <Descriptions.Item label={t('Locataire')}>
                {`${payment.lease.primary_renter.user.firstName} ${payment.lease.primary_renter.user.lastName}`}
              </Descriptions.Item>
            )}
            {payment.psp_transaction_id && (
              <Descriptions.Item label={t('ID Transaction PSP')}>{payment.psp_transaction_id}</Descriptions.Item>
            )}
            {payment.psp_reference && (
              <Descriptions.Item label={t('Référence PSP')}>{payment.psp_reference}</Descriptions.Item>
            )}
            {payment.mm_operator && (
              <Descriptions.Item label={t('Opérateur Mobile Money')}>{payment.mm_operator}</Descriptions.Item>
            )}
            {payment.mm_phone && (
              <Descriptions.Item label={t('Téléphone Mobile Money')}>{payment.mm_phone}</Descriptions.Item>
            )}
          </Descriptions>
        </div>

        {/* Allocations */}
        {payment.allocations && payment.allocations.length > 0 && (
          <div>
            <Title level={4}>{t('Allocations aux échéances')}</Title>
            <Table
              scroll={{ x: 'max-content' }}
              columns={allocationColumns}
              dataSource={payment.allocations}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </div>
        )}

        {(!payment.allocations || payment.allocations.length === 0) && (
          <Text type="secondary">{t('Aucune allocation trouvée pour ce paiement.')}</Text>
        )}
      </Space>
    </Modal>
  );
};
