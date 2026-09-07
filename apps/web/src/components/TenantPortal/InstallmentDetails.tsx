import React, { useState, useEffect } from 'react';
import {
  Descriptions,
  Typography,
  Spin,
  Alert,
  Table,
  Tag,
  Space,
  Card,
  Empty,
  Row,
  Col
} from 'antd';
import {
  DollarOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import { tenantPortalService } from '../../services/tenantPortalService';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface InstallmentDetailsData {
  installment: {
    id: string;
    period_year: number;
    period_month: number;
    due_date: string;
    amount_rent: number;
    amount_service: number;
    amount_other_fees: number;
    penalty_amount: number | null;
    amount_paid: number;
    status: string;
    totalAmount: number;
    balance: number;
    items: Array<{
      id: string;
      description: string;
      amount: number;
      type: string;
    }>;
    payments: Array<{
      id: string;
      amount: number;
      created_at: string;
      payment: {
        id: string;
        amount: number;
        method: string;
        status: string;
        succeeded_at: string | null;
        reference: string | null;
      };
    }>;
    penalties: Array<{
      id: string;
      amount: number;
      reason: string | null;
      applied_at: string;
    }>;
    lease: {
      id: string;
      lease_number: string;
      property: {
        id: string;
        address: string;
      };
    };
  };
  relatedPayments: Array<{
    id: string;
    amount: number;
    method: string;
    status: string;
    succeeded_at: string | null;
    reference: string | null;
    allocations: Array<{
      id: string;
      amount: number;
    }>;
  }>;
}

interface InstallmentDetailsProps {
  installmentId: string;
}

export default function InstallmentDetails({ installmentId }: InstallmentDetailsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InstallmentDetailsData | null>(null);

  useEffect(() => {
    loadInstallmentDetails();
  }, [installmentId]);

  const loadInstallmentDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await tenantPortalService.getInstallmentDetails(installmentId);
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError('Erreur lors du chargement des détails');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des détails');
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return dayjs(dateString).format('DD/MM/YYYY HH:mm');
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      PAID: { label: 'Payé', color: 'success' },
      DUE: { label: 'Dû', color: 'warning' },
      OVERDUE: { label: 'En retard', color: 'error' },
      PARTIAL: { label: 'Partiel', color: 'processing' },
      DRAFT: { label: 'Brouillon', color: 'default' },
      CANCELED: { label: 'Annulé', color: 'default' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      CASH: 'Espèces',
      BANK_TRANSFER: 'Virement bancaire',
      MOBILE_MONEY: 'Mobile Money',
      CHECK: 'Chèque',
      OTHER: 'Autre'
    };
    return labels[method] || method;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <Spin size="large" tip="Chargement des détails..." />
      </div>
    );
  }

  if (error) {
    return <Alert message="Erreur" description={error} type="error" showIcon />;
  }

  if (!data) {
    return <Empty description="Aucune donnée disponible" />;
  }

  const { installment } = data;
  if (!installment) {
    return <Empty description="Échéance introuvable" />;
  }

  // Items table columns
  const itemsColumns = [
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description'
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const typeLabels: Record<string, string> = {
          RENT: 'Loyer',
          SERVICE_CHARGE: 'Charges',
          OTHER_FEE: 'Autres frais',
          PENALTY: 'Pénalité'
        };
        return typeLabels[type] || type;
      }
    },
    {
      title: 'Montant',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => formatCurrency(amount),
      align: 'right' as const
    }
  ];

  // Payments table columns
  const paymentsColumns = [
    {
      title: 'Date',
      dataIndex: ['payment', 'succeeded_at'],
      key: 'date',
      render: (date: string | null) => formatDate(date)
    },
    {
      title: 'Montant',
      dataIndex: ['payment', 'amount'],
      key: 'amount',
      render: (amount: number) => formatCurrency(amount),
      align: 'right' as const
    },
    {
      title: 'Méthode',
      dataIndex: ['payment', 'method'],
      key: 'method',
      render: (method: string) => getPaymentMethodLabel(method)
    },
    {
      title: 'Référence',
      dataIndex: ['payment', 'reference'],
      key: 'reference',
      render: (ref: string | null) => ref || '-'
    },
    {
      title: 'Statut',
      dataIndex: ['payment', 'status'],
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'SUCCESS' ? 'success' : 'default'}>
          {status === 'SUCCESS' ? 'Réussi' : status}
        </Tag>
      )
    },
    {
      title: 'Alloué',
      dataIndex: 'amount',
      key: 'allocated',
      render: (amount: number) => formatCurrency(amount),
      align: 'right' as const
    }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Layout like InstallmentDetailPage: two cards side by side */}
      <Row gutter={[24, 24]}>
        <Col xs={24} md={12}>
          <Card
            title={
              <Space>
                <DollarOutlined />
                Informations financières
              </Space>
            }
          >
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Loyer">
                {formatCurrency(installment.amount_rent)}
              </Descriptions.Item>
              <Descriptions.Item label="Charges de service">
                {formatCurrency(installment.amount_service)}
              </Descriptions.Item>
              <Descriptions.Item label="Autres frais">
                {formatCurrency(installment.amount_other_fees)}
              </Descriptions.Item>
              <Descriptions.Item label="Pénalités">
                {formatCurrency(installment.penalty_amount || 0)}
              </Descriptions.Item>
              <Descriptions.Item label="Total dû">
                <Text strong>{formatCurrency(installment.totalAmount)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Montant payé">
                {formatCurrency(installment.amount_paid)}
              </Descriptions.Item>
              <Descriptions.Item label="Reste à payer">
                <Text strong type={installment.balance > 0 ? 'danger' : 'success'}>
                  {formatCurrency(installment.balance)}
                </Text>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            title={
              <Space>
                <CalendarOutlined />
                Informations
              </Space>
            }
          >
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Période">
                {installment.period_month != null && installment.period_year != null
                  ? `${installment.period_month}/${installment.period_year}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Date d'échéance">
                {formatDate(installment.due_date)}
              </Descriptions.Item>
              <Descriptions.Item label="Statut">
                {getStatusTag(installment.status)}
              </Descriptions.Item>
              <Descriptions.Item label="Bail">
                {installment.lease.lease_number}
              </Descriptions.Item>
              <Descriptions.Item label="Propriété">
                {installment.lease.property?.address || '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      {/* Items Breakdown (T056) */}
      {installment.items && installment.items.length > 0 && (
        <Card title={<><DollarOutlined /> Détail des éléments</>}>
          <Table
            columns={itemsColumns}
            dataSource={installment.items}
            rowKey="id"
            pagination={false}
            summary={(pageData) => {
              const total = pageData.reduce((sum, item) => sum + Number(item.amount), 0);
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}>
                      <Text strong>Total</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} />
                    <Table.Summary.Cell index={2} align="right">
                      <Text strong>{formatCurrency(total)}</Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              );
            }}
          />
        </Card>
      )}

      {/* Penalties (T056) */}
      {installment.penalties && installment.penalties.length > 0 && (
        <Card title="Pénalités appliquées">
          <Table
            columns={[
              {
                title: 'Montant',
                dataIndex: 'amount',
                key: 'amount',
                render: (amount: number) => formatCurrency(amount),
                align: 'right' as const
              },
              {
                title: 'Raison',
                dataIndex: 'reason',
                key: 'reason',
                render: (reason: string | null) => reason || '-'
              },
              {
                title: 'Date d\'application',
                dataIndex: 'applied_at',
                key: 'applied_at',
                render: (date: string) => formatDate(date)
              }
            ]}
            dataSource={installment.penalties}
            rowKey="id"
            pagination={false}
          />
        </Card>
      )}

      {/* Payment History (T050) */}
      <Card title="Historique des paiements">
        {installment.payments && installment.payments.length > 0 ? (
          <Table
            columns={paymentsColumns}
            dataSource={installment.payments}
            rowKey="id"
            pagination={false}
          />
        ) : (
          <Empty description="Aucun paiement enregistré pour cette échéance" />
        )}
      </Card>
    </Space>
  );
}
