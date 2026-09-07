import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Spin,
  Alert,
  Table,
  Tag,
  Space,
  Statistic,
  Descriptions,
  Empty
} from 'antd';
import {
  DollarOutlined,
  CalendarOutlined,
  WalletOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import { tenantPortalService } from '../../services/tenantPortalService';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface DepositMovement {
  id: string;
  type: string;
  amount: number;
  currency: string;
  note: string | null;
  createdAt: string;
  payment: {
    id: string;
    method: string;
    amount: number;
    succeeded_at: string | null;
  } | null;
  installment: {
    id: string;
    period: string;
  } | null;
  createdBy: {
    id: string;
    fullName: string | null;
    email: string;
  } | null;
}

interface DepositInfoData {
  deposit: {
    id: string;
    targetAmount: number;
    collectedAmount: number;
    heldAmount: number;
    refundedAmount: number;
    forfeitedAmount: number;
    currency: string;
    lease: {
      id: string;
      lease_number: string;
      lease_label?: string;
    };
  } | null;
  movements: DepositMovement[];
  currentHeldAmount: number;
}

export default function TenantDeposit() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DepositInfoData | null>(null);

  useEffect(() => {
    loadDepositInfo();
  }, []);

  const loadDepositInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await tenantPortalService.getDepositInfo();
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError('Erreur lors du chargement des informations du dépôt');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des informations du dépôt');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return dayjs(dateString).format('DD/MM/YYYY HH:mm');
  };

  const getMovementTypeLabel = (type: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      COLLECT: { label: 'Collecte', color: 'success' },
      HOLD: { label: 'Mise en retenue', color: 'warning' },
      RELEASE: { label: 'Libération', color: 'processing' },
      REFUND: { label: 'Remboursement', color: 'success' },
      FORFEIT: { label: 'Confiscation', color: 'error' },
      ADJUSTMENT: { label: 'Ajustement', color: 'default' }
    };
    const config = labels[type] || { label: type, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      CASH: 'Espèces',
      BANK_TRANSFER: 'Virement bancaire',
      MOBILE_MONEY: 'Mobile Money',
      CHECK: 'Chèque',
      CARD: 'Carte bancaire',
      OTHER: 'Autre'
    };
    return labels[method] || method;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Chargement des informations du dépôt..." />
      </div>
    );
  }

  if (error) {
    return <Alert message="Erreur" description={error} type="error" showIcon />;
  }

  if (!data || !data.deposit) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2}>Dépôt de garantie</Title>
          <Text type="secondary">Informations sur votre dépôt de garantie</Text>
        </div>
        <Empty description="Aucun dépôt de garantie trouvé" />
      </Space>
    );
  }

  const { deposit, movements, currentHeldAmount } = data;
  const availableAmount = deposit.collectedAmount - deposit.refundedAmount - deposit.forfeitedAmount;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div>
        <Title level={2}>Dépôt de garantie</Title>
        <Text type="secondary">Informations détaillées sur votre dépôt de garantie</Text>
      </div>

      {/* Deposit Summary Cards (T081) */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Montant cible"
              value={deposit.targetAmount}
              prefix={<DollarOutlined />}
              formatter={(value) => formatCurrency(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Montant collecté"
              value={deposit.collectedAmount}
              valueStyle={{ color: '#3f8600' }}
              prefix={<DollarOutlined />}
              formatter={(value) => formatCurrency(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Montant retenu"
              value={currentHeldAmount}
              valueStyle={{ color: '#faad14' }}
              prefix={<DollarOutlined />}
              formatter={(value) => formatCurrency(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Montant disponible"
              value={availableAmount}
              valueStyle={{ color: availableAmount > 0 ? '#3f8600' : '#cf1322' }}
              prefix={<DollarOutlined />}
              formatter={(value) => formatCurrency(Number(value))}
            />
          </Card>
        </Col>
      </Row>

      {/* Deposit Details (T081) */}
      <Card title={<><WalletOutlined /> Détails du dépôt</>}>
        <Descriptions bordered column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Numéro de bail">
            {deposit.lease.lease_number}
          </Descriptions.Item>
          {deposit.lease.lease_label && (
            <Descriptions.Item label="Nom du bail">
              {deposit.lease.lease_label}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="Devise">
            {deposit.currency}
          </Descriptions.Item>
          <Descriptions.Item label="Montant cible">
            <Text strong>{formatCurrency(deposit.targetAmount)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Montant collecté">
            <Text type="success">{formatCurrency(deposit.collectedAmount)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Montant retenu">
            <Text type="warning">{formatCurrency(deposit.heldAmount)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Montant remboursé">
            {formatCurrency(deposit.refundedAmount)}
          </Descriptions.Item>
          <Descriptions.Item label="Montant confisqué">
            <Text type="danger">{formatCurrency(deposit.forfeitedAmount)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Montant disponible">
            <Text strong style={{ fontSize: '16px', color: availableAmount > 0 ? '#3f8600' : '#cf1322' }}>
              {formatCurrency(availableAmount)}
            </Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Movements History (T082) */}
      <Card title={<><CalendarOutlined /> Historique des mouvements</>}>
        {movements && movements.length > 0 ? (
          <Table
            columns={[
              {
                title: 'Date',
                dataIndex: 'createdAt',
                key: 'date',
                render: (date: string) => (
                  <Space>
                    <CalendarOutlined />
                    {formatDate(date)}
                  </Space>
                ),
                sorter: (a: DepositMovement, b: DepositMovement) =>
                  dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix()
              },
              {
                title: 'Type',
                dataIndex: 'type',
                key: 'type',
                render: (type: string) => getMovementTypeLabel(type)
              },
              {
                title: 'Montant',
                dataIndex: 'amount',
                key: 'amount',
                render: (amount: number, record: DepositMovement) => {
                  const isPositive = ['COLLECT', 'ADJUSTMENT'].includes(record.type) || 
                                     (record.type === 'ADJUSTMENT' && amount > 0);
                  return (
                    <Text type={isPositive ? 'success' : 'danger'}>
                      {isPositive ? '+' : '-'}{formatCurrency(Math.abs(amount))}
                    </Text>
                  );
                },
                align: 'right' as const,
                sorter: (a: DepositMovement, b: DepositMovement) => a.amount - b.amount
              },
              {
                title: 'Paiement associé',
                dataIndex: ['payment', 'method'],
                key: 'payment',
                render: (method: string | null, record: DepositMovement) => {
                  if (!record.payment) return '-';
                  return (
                    <Space direction="vertical" size="small">
                      <Text>{getPaymentMethodLabel(record.payment.method)}</Text>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {formatCurrency(record.payment.amount)}
                      </Text>
                    </Space>
                  );
                }
              },
              {
                title: 'Échéance associée',
                dataIndex: ['installment', 'period'],
                key: 'installment',
                render: (period: string | null, record: DepositMovement) => record?.installment?.period ?? period ?? '-'
              },
              {
                title: 'Note',
                dataIndex: 'note',
                key: 'note',
                render: (note: string | null) => note || '-'
              },
              {
                title: 'Créé par',
                dataIndex: ['createdBy', 'fullName'],
                key: 'createdBy',
                render: (fullName: string | null, record: DepositMovement) => {
                  if (!record.createdBy) return '-';
                  return record.createdBy.fullName || record.createdBy.email;
                }
              }
            ]}
            dataSource={movements}
            rowKey="id"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `Total: ${total} mouvements`
            }}
          />
        ) : (
          <Empty description="Aucun mouvement enregistré" />
        )}
      </Card>
    </Space>
  );
}
