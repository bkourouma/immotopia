import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Tag,
  Space,
  Row,
  Col,
  Typography,
  Alert,
  Spin,
  Descriptions,
  Empty,
  Tabs,
  List,
  Statistic,
  Table
} from 'antd';
import type { TabsProps } from 'antd';
import {
  ArrowLeftOutlined,
  FileTextOutlined,
  UserOutlined,
  CalendarOutlined,
  DollarOutlined,
  SafetyOutlined,
  WalletOutlined
} from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;
const { TabPane } = Tabs;

interface LeaseDetailsData {
  lease: {
    id: string;
    lease_number: string;
    start_date: string;
    end_date: string | null;
    rent_amount: number;
    service_charge_amount: number;
    security_deposit_amount: number;
    status: string;
    property: {
      id: string;
      address: string;
      title: string;
    };
    primaryRenter: {
      user: {
        fullName: string;
        email: string;
      };
    };
    coRenters: Array<{
      user: {
        fullName: string;
        email: string;
      };
    }>;
  };
  installments: Array<{
    id: string;
    period_year: number;
    period_month: number;
    due_date: string;
    status: string;
    amount_rent: number;
    amount_service: number;
    amount_other_fees: number;
    penalty_amount: number;
    amount_paid: number;
  }>;
  paymentHistory: Array<{
    id: string;
    amount: number;
    succeeded_at: string;
    method: string;
    allocations: Array<{
      amount: number;
      installment: {
        period_year: number;
        period_month: number;
      };
    }>;
  }>;
  balance: {
    totalDue: number;
    totalPaid: number;
    remaining: number;
  };
  deposit: {
    target_amount: number;
    held_amount: number;
    refunded_amount: number;
    movements: Array<{
      id: string;
      type: string;
      amount: number;
      created_at: string;
      note: string | null;
    }>;
  } | null;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(amount);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString(activeLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const getStatusTag = (status: string) => {
  const statusMap: Record<string, { label: string; color: string }> = {
    ACTIVE: { label: t('Actif'), color: 'success' },
    ENDED: { label: t('Terminé'), color: 'default' },
    SUSPENDED: { label: t('Suspendu'), color: 'warning' },
    CANCELED: { label: t('Annulé'), color: 'error' },
    DRAFT: { label: t('Brouillon'), color: 'default' }
  };
  const config = statusMap[status] || { label: status, color: 'default' };
  return <Tag color={config.color}>{config.label}</Tag>;
};

const getPaymentMethodLabel = (method: string) => {
  const methods: Record<string, string> = {
    CASH: t('Espèces'),
    BANK_TRANSFER: t('Virement bancaire'),
    CHECK: t('Chèque'),
    MOBILE_MONEY: t('Mobile Money'),
    CARD: 'Carte',
    OTHER: 'Autre'
  };
  return methods[method] || method;
};

const getInstallmentStatusTag = (status: string) => {
  const statusMap: Record<string, { label: string; color: string }> = {
    DUE: { label: t('Échéance'), color: 'warning' },
    OVERDUE: { label: t('En retard'), color: 'error' },
    PAID: { label: t('Payé'), color: 'success' },
    PARTIAL: { label: t('Partiel'), color: 'processing' },
    DRAFT: { label: t('Brouillon'), color: 'default' }
  };
  const config = statusMap[status] || { label: status, color: 'default' };
  return <Tag color={config.color}>{config.label}</Tag>;
};

const getDepositMovementTypeLabel = (type: string) => {
  const types: Record<string, string> = {
    COLLECT: 'Collecte',
    HOLD: t('Détention'),
    RELEASE: t('Libération'),
    REFUND: 'Remboursement',
    FORFEIT: 'Confiscation',
    ADJUSTMENT: 'Ajustement'
  };
  return types[type] || type;
};

export default function LeaseDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LeaseDetailsData | null>(null);

  useEffect(() => {
    if (id) {
      loadLeaseDetails();
    }
  }, [id]);

  const loadLeaseDetails = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const response = await ownerPortalService.getLeaseDetails(id);
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError(t('Erreur lors du chargement des détails'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des détails'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={t('Chargement des détails...')} />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message={t('Erreur')}
        description={error}
        type="error"
        showIcon
        action={<Button onClick={() => navigate('/owner/leases')}>{t('Retour à la liste')}</Button>}
      />
    );
  }

  if (!data) {
    return <Empty description={t('Aucune donnée disponible')} />;
  }

  const installmentColumns = [
    {
      title: t('Période'),
      key: 'period',
      render: (record: any) => `${record.period_year}-${String(record.period_month).padStart(2, '0')}`
    },
    {
      title: t("Date d'échéance"),
      dataIndex: 'due_date',
      key: 'due_date',
      render: (date: string) => formatDate(date)
    },
    {
      title: t('Montant'),
      key: 'amount',
      render: (record: any) =>
        formatCurrency(
          Number(record.amount_rent) +
            Number(record.amount_service) +
            Number(record.amount_other_fees) +
            Number(record.penalty_amount || 0)
        )
    },
    {
      title: t('Payé'),
      dataIndex: 'amount_paid',
      key: 'amount_paid',
      render: (amount: number) => formatCurrency(Number(amount))
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getInstallmentStatusTag(status)
    }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Header */}
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/owner/leases')} style={{ marginBottom: 16 }}>
          {t('Retour')}
        </Button>
        <Title level={2}>
          {t('Bail')} {data.lease.lease_number}
        </Title>
        <Text type="secondary">{data.lease.property.address}</Text>
      </div>

      <Tabs defaultActiveKey="info">
        {/* T067: Lease Information Section */}
        <TabPane
          tab={
            <>
              <FileTextOutlined /> {t('Informations')}
            </>
          }
          key="info"
        >
          <Card title={t('Informations du bail')}>
            <Descriptions column={{ xs: 1, sm: 2 }} bordered>
              <Descriptions.Item label={t('Propriété')}>{data.lease.property.address}</Descriptions.Item>
              <Descriptions.Item label={t('Numéro de bail')}>{data.lease.lease_number}</Descriptions.Item>
              <Descriptions.Item label={t('Date de début')}>{formatDate(data.lease.start_date)}</Descriptions.Item>
              <Descriptions.Item label={t('Date de fin')}>
                {data.lease.end_date ? formatDate(data.lease.end_date) : t('Non définie')}
              </Descriptions.Item>
              <Descriptions.Item label={t('Loyer mensuel')}>
                {formatCurrency(Number(data.lease.rent_amount))}
              </Descriptions.Item>
              <Descriptions.Item label={t('Charges')}>
                {formatCurrency(Number(data.lease.service_charge_amount))}
              </Descriptions.Item>
              <Descriptions.Item label={t('Dépôt de garantie')}>
                {formatCurrency(Number(data.lease.security_deposit_amount))}
              </Descriptions.Item>
              <Descriptions.Item label={t('Statut')}>{getStatusTag(data.lease.status)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </TabPane>

        {/* T068: Renters Section */}
        <TabPane
          tab={
            <>
              <UserOutlined /> {t('Locataires')}
            </>
          }
          key="renters"
        >
          <Card title={t('Locataire principal')}>
            <Descriptions column={{ xs: 1, sm: 2 }} bordered>
              <Descriptions.Item label={t('Nom')}>{data.lease.primaryRenter.user.fullName}</Descriptions.Item>
              <Descriptions.Item label={t('Email')}>{data.lease.primaryRenter.user.email}</Descriptions.Item>
            </Descriptions>
          </Card>

          {data.lease.coRenters.length > 0 && (
            <Card title={t('Co-locataires')} style={{ marginTop: 16 }}>
              <List
                dataSource={data.lease.coRenters}
                renderItem={coRenter => (
                  <List.Item>
                    <List.Item.Meta title={coRenter.user.fullName} description={coRenter.user.email} />
                  </List.Item>
                )}
              />
            </Card>
          )}
        </TabPane>

        {/* T069: Installment Schedule Section */}
        <TabPane
          tab={
            <>
              <CalendarOutlined /> {t('Échéances')}
            </>
          }
          key="installments"
        >
          <Card title={t('Calendrier des échéances')}>
            {data.installments.length > 0 ? (
              <Table
                scroll={{ x: 'max-content' }}
                columns={installmentColumns}
                dataSource={data.installments}
                rowKey="id"
                pagination={{ pageSize: 10 }}
              />
            ) : (
              <Empty description={t('Aucune échéance')} />
            )}
          </Card>
        </TabPane>

        {/* T070: Payment History Section */}
        <TabPane
          tab={
            <>
              <WalletOutlined /> {t('Historique des paiements')}
            </>
          }
          key="payments"
        >
          <Card title={t('Historique des paiements')}>
            {data.paymentHistory.length > 0 ? (
              <List
                dataSource={data.paymentHistory}
                renderItem={payment => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{formatCurrency(payment.amount)}</Text>
                          <Tag>{getPaymentMethodLabel(payment.method)}</Tag>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={0}>
                          <Text type="secondary">{formatDate(payment.succeeded_at)}</Text>
                          {payment.allocations.length > 0 && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Allocations:{' '}
                              {payment.allocations.map((allocation, idx) => {
                                const inst = allocation.installment;
                                const periodLabel = inst
                                  ? `${inst.period_year}-${String(inst.period_month).padStart(2, '0')}`
                                  : '-';
                                return (
                                  <span key={idx}>
                                    {periodLabel} ({formatCurrency(allocation.amount)})
                                    {idx < payment.allocations.length - 1 ? ', ' : ''}
                                  </span>
                                );
                              })}
                            </Text>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description={t('Aucun paiement')} />
            )}
          </Card>
        </TabPane>

        {/* T071: Balance Section */}
        <TabPane
          tab={
            <>
              <DollarOutlined /> {t('Solde')}
            </>
          }
          key="balance"
        >
          <Card title={t('Solde du bail')}>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} lg={8}>
                <Statistic
                  title={t('Total dû')}
                  value={formatCurrency(data.balance.totalDue)}
                  prefix={<DollarOutlined />}
                  valueStyle={{ color: '#ff4d4f' }}
                />
              </Col>
              <Col xs={24} sm={12} lg={8}>
                <Statistic
                  title={t('Total payé')}
                  value={formatCurrency(data.balance.totalPaid)}
                  prefix={<DollarOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col xs={24} sm={12} lg={8}>
                <Statistic
                  title={t('Reste à payer')}
                  value={formatCurrency(data.balance.remaining)}
                  prefix={<DollarOutlined />}
                  valueStyle={{
                    color: data.balance.remaining > 0 ? '#ff4d4f' : '#52c41a',
                    fontWeight: 'bold'
                  }}
                />
              </Col>
            </Row>
            {data.balance.remaining > 0 && (
              <Alert
                message={t('Montant en attente de paiement')}
                description={t('Il reste {{value}} à payer pour ce bail.', {
                  value: formatCurrency(data.balance.remaining)
                })}
                type="warning"
                showIcon
                style={{ marginTop: 16 }}
              />
            )}
          </Card>
        </TabPane>

        {/* T072: Security Deposit Section */}
        <TabPane
          tab={
            <>
              <SafetyOutlined /> {t('Dépôt de garantie')}
            </>
          }
          key="deposit"
        >
          {data.deposit ? (
            <>
              <Card title={t('Dépôt de garantie')}>
                <Row gutter={[16, 16]}>
                  <Col xs={24} sm={12} lg={8}>
                    <Statistic
                      title={t('Montant cible')}
                      value={formatCurrency(Number(data.deposit.target_amount))}
                      prefix={<SafetyOutlined />}
                    />
                  </Col>
                  <Col xs={24} sm={12} lg={8}>
                    <Statistic
                      title={t('Montant détenu')}
                      value={formatCurrency(Number(data.deposit.held_amount))}
                      prefix={<SafetyOutlined />}
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Col>
                  <Col xs={24} sm={12} lg={8}>
                    <Statistic
                      title={t('Montant remboursé')}
                      value={formatCurrency(Number(data.deposit.refunded_amount))}
                      prefix={<SafetyOutlined />}
                      valueStyle={{ color: '#52c41a' }}
                    />
                  </Col>
                </Row>
              </Card>

              {data.deposit.movements.length > 0 && (
                <Card title={t('Historique des mouvements')} style={{ marginTop: 16 }}>
                  <List
                    dataSource={data.deposit.movements}
                    renderItem={movement => (
                      <List.Item>
                        <List.Item.Meta
                          title={
                            <Space>
                              <Text strong>{getDepositMovementTypeLabel(movement.type)}</Text>
                              <Text>{formatCurrency(movement.amount)}</Text>
                            </Space>
                          }
                          description={
                            <Space direction="vertical" size={0}>
                              <Text type="secondary">{formatDate(movement.created_at)}</Text>
                              {movement.note && <Text type="secondary">{movement.note}</Text>}
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </Card>
              )}
            </>
          ) : (
            <Empty description={t('Aucun dépôt de garantie enregistré')} />
          )}
        </TabPane>
      </Tabs>
    </Space>
  );
}
