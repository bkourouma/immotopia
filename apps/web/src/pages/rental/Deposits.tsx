import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { App, Table, Button, Tag, Space, Typography, Empty, Alert, Card, Row, Col, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SafetyOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import {
  getDeposit,
  createDeposit,
  createDepositMovement,
  listDepositMovements,
  RentalSecurityDeposit,
  RentalDepositMovement,
  CreateDepositMovementRequest,
  RentalDepositMovementType
} from '../../services/rental-service';
import { DepositMovementForm } from '../../components/rental/DepositMovementForm';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text, Title } = Typography;

interface DepositsProps {
  leaseId?: string;
}

export const Deposits: React.FC<DepositsProps> = ({ leaseId: propLeaseId }) => {
  const { message } = App.useApp();

  const { tenantId, leaseId: paramLeaseId } = useParams<{ tenantId: string; leaseId?: string }>();
  const leaseId = propLeaseId || paramLeaseId;
  const [deposit, setDeposit] = useState<RentalSecurityDeposit | null>(null);
  const [movements, setMovements] = useState<RentalDepositMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMovementForm, setShowMovementForm] = useState(false);

  useEffect(() => {
    if (tenantId && leaseId) {
      loadDeposit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, leaseId]);

  // Movements depend on the deposit id, which is only known once loadDeposit
  // resolves. Calling both in the effect above meant loadMovements always
  // early-returned and movements never appeared on first render.
  useEffect(() => {
    if (tenantId && deposit?.id) {
      loadMovements();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, deposit?.id]);

  const loadDeposit = async () => {
    if (!tenantId || !leaseId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getDeposit(tenantId, leaseId);
      if (response.success) {
        setDeposit(response.data);
      } else {
        // No deposit yet: it is created server-side on the first movement.
        setDeposit(null);
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        // Deposit doesn't exist yet, that's okay
        setDeposit(null);
      } else {
        setError(err.response?.data?.message || t('Erreur lors du chargement du dépôt'));
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMovements = async () => {
    if (!tenantId || !deposit?.id) return;
    try {
      const response = await listDepositMovements(tenantId, deposit.id);
      if (response.success) {
        setMovements(response.data);
      }
    } catch (err: any) {
      console.error('Error loading movements:', err);
    }
  };

  const handleCreateMovement = async (data: CreateDepositMovementRequest) => {
    if (!tenantId || !deposit) return;
    try {
      await createDepositMovement(tenantId, deposit.id, data);
      setShowMovementForm(false);
      await loadDeposit();
      await loadMovements();
      message.success(t('Mouvement enregistré avec succès.'));
    } catch (err: any) {
      const msg = err?.response?.data?.message || t("Erreur lors de l'enregistrement du mouvement.");
      message.error(msg);
      throw err;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(activeLocale());
  };

  const formatCurrency = (amount: number, currency: string = 'FCFA') => {
    return new Intl.NumberFormat(activeLocale(), {
      style: 'currency',
      currency: currency === 'FCFA' ? 'XOF' : currency
    }).format(amount);
  };

  const getMovementTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      COLLECT: 'Collecte',
      HOLD: 'Blocage',
      RELEASE: t('Libération'),
      REFUND: 'Remboursement',
      FORFEIT: 'Confiscation',
      ADJUSTMENT: 'Ajustement'
    };
    return typeMap[type] || type;
  };

  const getMovementTypeIcon = (type: string) => {
    if (type === 'COLLECT' || type === 'ADJUSTMENT') {
      return <ArrowUpOutlined style={{ color: '#52c41a' }} />;
    }
    if (type === 'RELEASE' || type === 'REFUND' || type === 'FORFEIT') {
      return <ArrowDownOutlined style={{ color: '#ff4d4f' }} />;
    }
    return <SafetyOutlined style={{ color: '#1890ff' }} />;
  };

  // If used as standalone page (not in tab)
  const isStandalone = !propLeaseId;

  if (loading) {
    const loadingContent = (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <Spin size="large" />
      </div>
    );
    if (isStandalone) {
      return <>{loadingContent}</>;
    }
    return loadingContent;
  }

  const content = (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row gutter={[16, 16]} justify="space-between" align="middle">
          <Col xs={24} sm={24} md={12} lg={14}>
            <Title level={2} style={{ margin: 0 }}>
              {t('Dépôt de garantie')}
            </Title>
            <Text type="secondary">{t('Gérez le dépôt de garantie du bail')}</Text>
          </Col>
          <Col xs={24} sm={24} md={12} lg={10}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
              {deposit && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowMovementForm(true)}>
                  {t('Nouveau mouvement')}
                </Button>
              )}
            </div>
          </Col>
        </Row>

        {error && (
          <Alert
            message={t('Erreur')}
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}

        {deposit ? (
          <>
            <Card>
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <div>
                    <Text type="secondary">{t('Montant cible')}</Text>
                    <Title level={3} style={{ margin: '8px 0 0 0' }}>
                      {formatCurrency(deposit.target_amount, deposit.currency)}
                    </Title>
                  </div>
                </Col>
                <Col xs={24} md={8}>
                  <div>
                    <Text type="secondary">{t('Solde actuel')}</Text>
                    <Title level={3} style={{ margin: '8px 0 0 0' }}>
                      {formatCurrency(deposit.current_balance, deposit.currency)}
                    </Title>
                  </div>
                </Col>
                <Col xs={24} md={8}>
                  <div>
                    <Text type="secondary">{t('Statut')}</Text>
                    <div style={{ marginTop: 8 }}>
                      <Tag color={deposit.current_balance >= deposit.target_amount ? 'success' : 'default'}>
                        {deposit.current_balance >= deposit.target_amount ? t('Complet') : t('En attente')}
                      </Tag>
                    </div>
                  </div>
                </Col>
              </Row>
            </Card>

            {showMovementForm && (
              <Card>
                <DepositMovementForm
                  tenantId={tenantId!}
                  deposit={deposit}
                  leaseId={leaseId}
                  onSubmit={handleCreateMovement}
                  onCancel={() => setShowMovementForm(false)}
                />
              </Card>
            )}

            <Card title={t('Historique des mouvements')}>
              <Table
                dataSource={movements}
                loading={loading}
                rowKey="id"
                scroll={{ x: 'max-content' }}
                locale={{
                  emptyText: 'Aucun mouvement enregistré'
                }}
                columns={[
                  {
                    title: t('Date'),
                    key: 'created_at',
                    render: (_, record) => formatDate(record.created_at)
                  },
                  {
                    title: t('Type'),
                    key: 'type',
                    render: (_, record) => (
                      <Space>
                        {getMovementTypeIcon(record.type)}
                        <span>{getMovementTypeLabel(record.type)}</span>
                      </Space>
                    )
                  },
                  {
                    title: t('Montant'),
                    key: 'amount',
                    render: (_, record) => {
                      const isPositive = record.type === 'COLLECT' || record.type === 'ADJUSTMENT';
                      return (
                        <Text type={isPositive ? 'success' : 'danger'} strong>
                          {isPositive ? '+' : '-'}
                          {formatCurrency(record.amount, record.currency)}
                        </Text>
                      );
                    }
                  },
                  {
                    title: t('Note'),
                    key: 'note',
                    render: (_, record) => record.note || '-'
                  }
                ]}
              />
            </Card>
          </>
        ) : (
          <Empty description={t('Aucun dépôt de garantie configuré pour ce bail')} />
        )}
      </Space>
    </>
  );

  if (isStandalone) {
    return <>{content}</>;
  }

  return content;
};
