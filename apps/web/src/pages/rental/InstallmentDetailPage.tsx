import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Row, Col, Tag, Typography, Spin, Alert, Descriptions, Space } from 'antd';
import { ArrowLeftOutlined, DollarOutlined, CalendarOutlined } from '@ant-design/icons';
import { getInstallment, RentalInstallment, RentalInstallmentStatus } from '../../services/rental-service';
import { InstallmentPaymentLinksPanel } from '../../components/rental/InstallmentPaymentLinksPanel';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;

export const InstallmentDetailPage: React.FC = () => {
  const { tenantId, installmentId } = useParams<{ tenantId: string; installmentId: string }>();
  const navigate = useNavigate();
  const [installment, setInstallment] = useState<RentalInstallment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenantId && installmentId) {
      loadInstallment();
    }
  }, [tenantId, installmentId]);

  const loadInstallment = async () => {
    if (!tenantId || !installmentId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getInstallment(tenantId, installmentId);
      if (response.success) {
        setInstallment(response.data);
      } else {
        setError(t("Erreur lors du chargement de l'échéance"));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t("Erreur lors du chargement de l'échéance"));
    } finally {
      setLoading(false);
    }
  };

  const getStatusTag = (status: RentalInstallmentStatus) => {
    const statusMap: Partial<Record<RentalInstallmentStatus, { label: string; color: string }>> = {
      DRAFT: { label: t('Brouillon'), color: 'default' },
      DUE: { label: t('Échéance'), color: 'blue' },
      PARTIAL: { label: t('Partiel'), color: 'orange' },
      PAID: { label: t('Payé'), color: 'green' },
      OVERDUE: { label: t('En retard'), color: 'red' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString(activeLocale());
  };

  const formatCurrency = (amount: number, currency: string = 'FCFA') => {
    return new Intl.NumberFormat(activeLocale(), {
      style: 'currency',
      currency: currency === 'FCFA' ? 'XOF' : currency
    }).format(amount);
  };

  const calculateTotalDue = (inst: RentalInstallment) => {
    return (
      Number(inst.amount_rent || 0) +
      Number(inst.amount_service || 0) +
      Number(inst.amount_other_fees || 0) +
      Number(inst.penalty_amount || 0)
    );
  };

  if (loading) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" tip="Chargement..." />
        </div>
      </>
    );
  }

  if (error || !installment) {
    return (
      <>
        <Alert message={error || t('Échéance non trouvée')} type="error" showIcon />
      </>
    );
  }

  const totalDue = calculateTotalDue(installment);
  const remaining = totalDue - Number(installment.amount_paid || 0);

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}
        >
          <Space size="middle">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/tenant/${tenantId}/rental/leases/${installment.lease_id}`)}
            >
              {t('Retour')}
            </Button>
            <div>
              <Title level={3} style={{ margin: 0 }}>
                {t('Échéance')} {installment.period_month}/{installment.period_year}
              </Title>
              <Text type="secondary">{t("Détails de l'échéance")}</Text>
            </div>
          </Space>
          {getStatusTag(installment.status)}
        </div>

        <Row gutter={[24, 24]}>
          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <DollarOutlined />
                  {t('Informations financières')}
                </Space>
              }
            >
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label={t('Loyer')}>
                  {formatCurrency(installment.amount_rent, installment.currency)}
                </Descriptions.Item>
                <Descriptions.Item label={t('Charges de service')}>
                  {formatCurrency(installment.amount_service, installment.currency)}
                </Descriptions.Item>
                <Descriptions.Item label={t('Autres frais')}>
                  {formatCurrency(installment.amount_other_fees, installment.currency)}
                </Descriptions.Item>
                <Descriptions.Item label={t('Pénalités')}>
                  {formatCurrency(installment.penalty_amount, installment.currency)}
                </Descriptions.Item>
                <Descriptions.Item label={t('Total dû')}>
                  <Text strong>{formatCurrency(totalDue, installment.currency)}</Text>
                </Descriptions.Item>
                <Descriptions.Item label={t('Montant Payé')}>
                  {formatCurrency(installment.amount_paid, installment.currency)}
                </Descriptions.Item>
                <Descriptions.Item label={t('Reste à payer')}>
                  <Text strong type={remaining > 0 ? 'danger' : 'success'}>
                    {formatCurrency(remaining, installment.currency)}
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
                  {t('Informations')}
                </Space>
              }
            >
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label={t('Période')}>
                  {installment.period_month}/{installment.period_year}
                </Descriptions.Item>
                <Descriptions.Item label={t("Date d'échéance")}>{formatDate(installment.due_date)}</Descriptions.Item>
                <Descriptions.Item label={t('Statut')}>{getStatusTag(installment.status)}</Descriptions.Item>
                {installment.paid_at && (
                  <Descriptions.Item label={t('Date de paiement')}>{formatDate(installment.paid_at)}</Descriptions.Item>
                )}
                <Descriptions.Item label={t('Devise')}>{installment.currency}</Descriptions.Item>
                <Descriptions.Item label={t('Date de création')}>
                  {formatDate(installment.created_at)}
                </Descriptions.Item>
                <Descriptions.Item label={t('Dernière mise à jour')}>
                  {formatDate(installment.updated_at)}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>

        {tenantId && installmentId && (
          <InstallmentPaymentLinksPanel
            tenantId={tenantId}
            installmentId={installmentId}
            remaining={remaining}
            status={installment.status}
            periodLabel={`${installment.period_month}/${installment.period_year}`}
          />
        )}
      </Space>
    </>
  );
};
