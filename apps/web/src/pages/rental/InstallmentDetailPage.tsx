import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Row,
  Col,
  Tag,
  Typography,
  Spin,
  Alert,
  Descriptions,
  Space,
} from 'antd';
import { ArrowLeftOutlined, DollarOutlined, CalendarOutlined } from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { getInstallment, RentalInstallment, RentalInstallmentStatus } from '../../services/rental-service';

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
        setError('Erreur lors du chargement de l\'Ã©chÃ©ance');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement de l\'Ã©chÃ©ance');
    } finally {
      setLoading(false);
    }
  };

  const getStatusTag = (status: RentalInstallmentStatus) => {
    const statusMap: Partial<Record<RentalInstallmentStatus, { label: string; color: string }>> = {
      DRAFT: { label: 'Brouillon', color: 'default' },
      DUE: { label: 'Échéance', color: 'blue' },
      PARTIAL: { label: 'Partiel', color: 'orange' },
      PAID: { label: 'Payé', color: 'green' },
      OVERDUE: { label: 'En retard', color: 'red' },
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const formatCurrency = (amount: number, currency: string = 'FCFA') => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency === 'FCFA' ? 'XOF' : currency,
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
      <DashboardLayout>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" tip="Chargement..." />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !installment) {
    return (
      <DashboardLayout>
        <Alert
          message={error || 'Échéance non trouvée'}
          type="error"
          showIcon
        />
      </DashboardLayout>
    );
  }

  const totalDue = calculateTotalDue(installment);
  const remaining = totalDue - Number(installment.amount_paid || 0);

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <Space size="middle">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/tenant/${tenantId}/rental/leases/${installment.lease_id}`)}
            >
              Retour
            </Button>
            <div>
              <Title level={3} style={{ margin: 0 }}>
                Échéance {installment.period_month}/{installment.period_year}
              </Title>
              <Text type="secondary">DÃ©tails de l'Ã©chÃ©ance</Text>
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
                  Informations financiÃ¨res
                </Space>
              }
            >
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="Loyer">
                  {formatCurrency(installment.amount_rent, installment.currency)}
                </Descriptions.Item>
                <Descriptions.Item label="Charges de service">
                  {formatCurrency(installment.amount_service, installment.currency)}
                </Descriptions.Item>
                <Descriptions.Item label="Autres frais">
                  {formatCurrency(installment.amount_other_fees, installment.currency)}
                </Descriptions.Item>
                <Descriptions.Item label="Pénalités">
                  {formatCurrency(installment.penalty_amount, installment.currency)}
                </Descriptions.Item>
                <Descriptions.Item label="Total dû">
                  <Text strong>{formatCurrency(totalDue, installment.currency)}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Montant Payé">
                  {formatCurrency(installment.amount_paid, installment.currency)}
                </Descriptions.Item>
                <Descriptions.Item label="Reste à payer">
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
                  Informations
                </Space>
              }
            >
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="Période">
                  {installment.period_month}/{installment.period_year}
                </Descriptions.Item>
                <Descriptions.Item label="Date d'échéance">
                  {formatDate(installment.due_date)}
                </Descriptions.Item>
                <Descriptions.Item label="Statut">
                  {getStatusTag(installment.status)}
                </Descriptions.Item>
                {installment.paid_at && (
                  <Descriptions.Item label="Date de paiement">
                    {formatDate(installment.paid_at)}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Devise">{installment.currency}</Descriptions.Item>
                <Descriptions.Item label="Date de création">
                  {formatDate(installment.created_at)}
                </Descriptions.Item>
                <Descriptions.Item label="Dernière mise à jour">
                  {formatDate(installment.updated_at)}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>
      </Space>
    </DashboardLayout>
  );
};


