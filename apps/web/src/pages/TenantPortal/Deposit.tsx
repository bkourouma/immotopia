import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Spin,
  Alert,
  Tag,
  Space,
  Statistic,
  Descriptions,
  Empty,
  Select,
  Button
} from 'antd';
import {
  DollarOutlined,
  CalendarOutlined,
  WalletOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import { tenantPortalService } from '../../services/tenantPortalService';
import { Table } from '../../components/primitives';
import dayjs from 'dayjs';
import { t } from '../../i18n/t';

import { deviseAffichee, formatMontantLocatif } from '../../lib/rental-labels';
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
  const [leases, setLeases] = useState<
    Array<{ id: string; leaseNumber: string; propertyAddress: string; isDefault?: boolean }>
  >([]);
  const [selectedLeaseId, setSelectedLeaseId] = useState<string | undefined>(undefined);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    tenantPortalService
      .getLeases()
      .then(response => {
        if (!cancelled) setLeases(response.data?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setError(t('Erreur lors du chargement des informations du dépôt'));
      });
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  useEffect(() => {
    let cancelled = false;
    const loadDepositInfo = async () => {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const response = await tenantPortalService.getDepositInfo(selectedLeaseId);
        if (cancelled) return;
        if (response.data?.success && response.data?.data) {
          setData(response.data.data);
        } else {
          setError(t('Erreur lors du chargement des informations du dépôt'));
        }
      } catch (err: any) {
        if (!cancelled)
          setError(err.response?.data?.message || t('Erreur lors du chargement des informations du dépôt'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadDepositInfo();
    return () => {
      cancelled = true;
    };
  }, [selectedLeaseId, retryKey]);

  const leaseSelector =
    leases.length > 1 ? (
      <Select
        aria-label={t('Bail')}
        style={{ minWidth: 280, maxWidth: '100%' }}
        value={selectedLeaseId ?? data?.deposit?.lease.id ?? leases.find(lease => lease.isDefault)?.id ?? leases[0].id}
        onChange={value => setSelectedLeaseId(value)}
        options={leases.map(lease => ({
          value: lease.id,
          label: lease.propertyAddress ? `${lease.leaseNumber} — ${lease.propertyAddress}` : lease.leaseNumber
        }))}
      />
    ) : null;

  const formatCurrency = (amount: number) => formatMontantLocatif(amount, data?.deposit?.currency);

  const formatDate = (dateString: string) => {
    return dayjs(dateString).format('DD/MM/YYYY HH:mm');
  };

  const getMovementTypeLabel = (type: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      COLLECT: { label: t('Collecte'), color: 'success' },
      HOLD: { label: t('Mise en retenue'), color: 'warning' },
      RELEASE: { label: t('Libération'), color: 'processing' },
      REFUND: { label: t('Remboursement'), color: 'success' },
      FORFEIT: { label: t('Confiscation'), color: 'error' },
      ADJUSTMENT: { label: t('Ajustement'), color: 'default' }
    };
    const config = labels[type] || { label: type, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      CASH: t('Espèces'),
      BANK_TRANSFER: t('Virement bancaire'),
      MOBILE_MONEY: t('Mobile Money'),
      DIRECT_DEBIT: t('Prélèvement bancaire'),
      CHECK: t('Chèque'),
      CARD: t('Carte bancaire'),
      OTHER: t('Autre')
    };
    return labels[method] || method;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={t('Chargement des informations du dépôt...')} />
      </div>
    );
  }

  if (error) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {leaseSelector}
        <Alert message={t('Erreur')} description={error} type="error" showIcon />
        <Button onClick={() => setRetryKey(key => key + 1)}>{t('Réessayer')}</Button>
      </Space>
    );
  }

  if (!data || !data.deposit) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2}>{t('Dépôt de garantie')}</Title>
          <Text type="secondary">{t('Informations sur votre dépôt de garantie')}</Text>
        </div>
        {leaseSelector}
        <Empty description={t('Aucun dépôt de garantie trouvé')} />
      </Space>
    );
  }

  const { deposit, movements } = data;
  const availableAmount = deposit.collectedAmount - deposit.refundedAmount - deposit.forfeitedAmount;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div>
        <Title level={2}>{t('Dépôt de garantie')}</Title>
        <Text type="secondary">{t('Informations détaillées sur votre dépôt de garantie')}</Text>
      </div>
      {leaseSelector}

      {/* Deposit Summary Cards (T081) */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('Montant cible')}
              value={deposit.targetAmount}
              prefix={<DollarOutlined />}
              formatter={value => formatCurrency(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('Montant collecté')}
              value={deposit.collectedAmount}
              valueStyle={{ color: '#3f8600' }}
              prefix={<DollarOutlined />}
              formatter={value => formatCurrency(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('Montant retenu')}
              value={deposit.heldAmount}
              valueStyle={{ color: '#faad14' }}
              prefix={<DollarOutlined />}
              formatter={value => formatCurrency(Number(value))}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('Montant disponible')}
              value={availableAmount}
              valueStyle={{ color: availableAmount > 0 ? '#3f8600' : '#cf1322' }}
              prefix={<DollarOutlined />}
              formatter={value => formatCurrency(Number(value))}
            />
          </Card>
        </Col>
      </Row>

      {/* Deposit Details (T081) */}
      <Card
        title={
          <>
            <WalletOutlined /> {t('Détails du dépôt')}
          </>
        }
      >
        <Descriptions bordered column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label={t('Numéro de bail')}>{deposit.lease.lease_number}</Descriptions.Item>
          {deposit.lease.lease_label && (
            <Descriptions.Item label={t('Nom du bail')}>{deposit.lease.lease_label}</Descriptions.Item>
          )}
          <Descriptions.Item label={t('Devise')}>{deviseAffichee(deposit.currency)}</Descriptions.Item>
          <Descriptions.Item label={t('Montant cible')}>
            <Text strong>{formatCurrency(deposit.targetAmount)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('Montant collecté')}>
            <Text type="success">{formatCurrency(deposit.collectedAmount)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('Montant retenu')}>
            <Text type="warning">{formatCurrency(deposit.heldAmount)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('Montant remboursé')}>{formatCurrency(deposit.refundedAmount)}</Descriptions.Item>
          <Descriptions.Item label={t('Montant confisqué')}>
            <Text type="danger">{formatCurrency(deposit.forfeitedAmount)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('Montant disponible')}>
            <Text strong style={{ fontSize: '16px', color: availableAmount > 0 ? '#3f8600' : '#cf1322' }}>
              {formatCurrency(availableAmount)}
            </Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Movements History (T082) */}
      <Card
        title={
          <>
            <CalendarOutlined /> {t('Historique des mouvements')}
          </>
        }
      >
        {movements && movements.length > 0 ? (
          <Table
            exportFilename={t('Historique des mouvements')}
            scroll={{ x: 'max-content' }}
            columns={[
              {
                title: t('Date'),
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
                title: t('Type'),
                dataIndex: 'type',
                key: 'type',
                render: (type: string) => getMovementTypeLabel(type)
              },
              {
                title: t('Montant'),
                dataIndex: 'amount',
                key: 'amount',
                // Montant signé, en nombre pur : Excel peut le sommer.
                exportValue: (record: DepositMovement) =>
                  ['COLLECT', 'ADJUSTMENT'].includes(record.type) ? Math.abs(record.amount) : -Math.abs(record.amount),
                render: (amount: number, record: DepositMovement) => {
                  const isPositive =
                    ['COLLECT', 'ADJUSTMENT'].includes(record.type) || (record.type === 'ADJUSTMENT' && amount > 0);
                  return (
                    <Text type={isPositive ? 'success' : 'danger'}>
                      {isPositive ? '+' : '-'}
                      {formatCurrency(Math.abs(amount))}
                    </Text>
                  );
                },
                align: 'end' as const,
                sorter: (a: DepositMovement, b: DepositMovement) => a.amount - b.amount
              },
              {
                title: t('Paiement associé'),
                dataIndex: ['payment', 'method'],
                key: 'payment',
                exportValue: (record: DepositMovement) =>
                  record.payment
                    ? `${getPaymentMethodLabel(record.payment.method)} — ${formatCurrency(record.payment.amount)}`
                    : '',
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
                title: t('Échéance associée'),
                dataIndex: ['installment', 'period'],
                key: 'installment',
                render: (period: string | null, record: DepositMovement) => record?.installment?.period ?? period ?? '-'
              },
              {
                title: t('Note'),
                dataIndex: 'note',
                key: 'note',
                render: (note: string | null) => note || '-'
              }
            ]}
            dataSource={movements}
            rowKey="id"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: total => t('Total: {{total}} mouvements', { total: total })
            }}
          />
        ) : (
          <Empty description={t('Aucun mouvement enregistré')} />
        )}
      </Card>
    </Space>
  );
}
