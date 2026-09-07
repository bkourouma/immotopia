import React from 'react';
import { Modal, Descriptions, Table, Tag, Typography, Space } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

interface PaymentDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  payment: any;
  loading?: boolean;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(amount);
};

const getStatusTag = (status: string) => {
  const statusConfig: Record<string, { color: string; text: string }> = {
    PENDING: { color: 'default', text: 'En attente' },
    SUCCESS: { color: 'green', text: 'Réussi' },
    FAILED: { color: 'red', text: 'Échoué' },
    CANCELED: { color: 'orange', text: 'Annulé' }
  };

  const config = statusConfig[status] || { color: 'default', text: status };
  return <Tag color={config.color}>{config.text}</Tag>;
};

const getMethodLabel = (method: string) => {
  const methodLabels: Record<string, string> = {
    MOBILE_MONEY: 'Mobile Money',
    BANK_TRANSFER: 'Virement bancaire',
    CASH: 'Espèces',
    CHECK: 'Chèque',
    CARD: 'Carte bancaire'
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
      title: 'Échéance',
      key: 'installment',
      render: (record: any) => {
        const inst = record.installment;
        if (!inst) return '-';
        const period = `${inst.period_month.toString().padStart(2, '0')}/${inst.period_year}`;
        return `Échéance ${period}`;
      }
    },
    {
      title: 'Propriété',
      key: 'property',
      render: (record: any) => {
        return record.installment?.lease?.property?.address || '-';
      }
    },
    {
      title: 'Montant alloué',
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
          <span>Détails du paiement</span>
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
          <Title level={4}>Informations du paiement</Title>
          <Descriptions bordered column={2}>
            <Descriptions.Item label="Montant">
              <Text strong>{formatCurrency(Number(payment.amount))}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Statut">
              {getStatusTag(payment.status)}
            </Descriptions.Item>
            <Descriptions.Item label="Méthode">
              {getMethodLabel(payment.method)}
            </Descriptions.Item>
            <Descriptions.Item label="Date">
              {payment.succeeded_at
                ? dayjs(payment.succeeded_at).format('DD/MM/YYYY HH:mm')
                : payment.initiated_at
                ? dayjs(payment.initiated_at).format('DD/MM/YYYY HH:mm')
                : '-'}
            </Descriptions.Item>
            {payment.lease?.property && (
              <Descriptions.Item label="Propriété">
                {payment.lease.property.address}
              </Descriptions.Item>
            )}
            {payment.lease?.primary_renter?.user && (
              <Descriptions.Item label="Locataire">
                {`${payment.lease.primary_renter.user.firstName} ${payment.lease.primary_renter.user.lastName}`}
              </Descriptions.Item>
            )}
            {payment.psp_transaction_id && (
              <Descriptions.Item label="ID Transaction PSP">
                {payment.psp_transaction_id}
              </Descriptions.Item>
            )}
            {payment.psp_reference && (
              <Descriptions.Item label="Référence PSP">
                {payment.psp_reference}
              </Descriptions.Item>
            )}
            {payment.mm_operator && (
              <Descriptions.Item label="Opérateur Mobile Money">
                {payment.mm_operator}
              </Descriptions.Item>
            )}
            {payment.mm_phone && (
              <Descriptions.Item label="Téléphone Mobile Money">
                {payment.mm_phone}
              </Descriptions.Item>
            )}
          </Descriptions>
        </div>

        {/* Allocations */}
        {payment.allocations && payment.allocations.length > 0 && (
          <div>
            <Title level={4}>Allocations aux échéances</Title>
            <Table
              columns={allocationColumns}
              dataSource={payment.allocations}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </div>
        )}

        {(!payment.allocations || payment.allocations.length === 0) && (
          <Text type="secondary">Aucune allocation trouvée pour ce paiement.</Text>
        )}
      </Space>
    </Modal>
  );
};
