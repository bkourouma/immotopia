import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Row, Col, Tag, Typography, Descriptions, Space } from 'antd';
import { DollarOutlined, CalendarOutlined } from '@ant-design/icons';
import { getInstallment, RentalInstallment, RentalInstallmentStatus } from '../../services/rental-service';
import { InstallmentPaymentLinksPanel } from '../../components/rental/InstallmentPaymentLinksPanel';
import { InstallmentReminderButton } from '../../components/rental/reminders/InstallmentReminderButton';
import { InstallmentRemindersHistoryPanel } from '../../components/rental/reminders/InstallmentRemindersHistoryPanel';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';
import { formatMoney } from '../../components/primitives/MoneyValue';
import { PageHeader } from '../../components/primitives/PageHeader';
import { StateBlock } from '../../components/primitives/StateBlock';
import { SkeletonDetail } from '../../components/primitives/Skeleton';
import { deviseAffichee, libellePeriodeEcheance } from '../../lib/rental-labels';
import { useMyMenuAccess } from '../../hooks/useMenuAccess';

import { activeLocale } from '../../i18n/format';
const { Text } = Typography;

export const InstallmentDetailPage: React.FC = () => {
  const { tenantId, installmentId } = useParams<{ tenantId: string; installmentId: string }>();
  const { permissions, ready } = useMyMenuAccess(tenantId);
  const navigate = useNavigate();
  const [installment, setInstallment] = useState<RentalInstallment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remindersRefresh, setRemindersRefresh] = useState(0);

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

  // Utilitaire commun : le franc CFA s'écrit « FCFA », jamais « F CFA » ni « XOF » (H31).
  const formatCurrency = (amount: number, currency: string = 'FCFA') => formatMoney(amount, { currency });

  const calculateTotalDue = (inst: RentalInstallment) => {
    return (
      Number(inst.amount_rent || 0) +
      Number(inst.amount_service || 0) +
      Number(inst.amount_other_fees || 0) +
      Number(inst.penalty_amount || 0)
    );
  };

  if (loading) {
    return <SkeletonDetail aria-label={t("Chargement de l'échéance")} />;
  }

  if (error || !installment) {
    return (
      <StateBlock
        variant="error"
        title={t('Échéance non chargée')}
        description={error || t('Échéance non trouvée')}
        actions={[
          { label: t('Réessayer'), onClick: () => void loadInstallment(), primary: true },
          { label: t('Retour aux baux'), onClick: () => navigate(`/tenant/${tenantId}/rental/leases`) }
        ]}
      />
    );
  }

  const totalDue = calculateTotalDue(installment);
  const remaining = totalDue - Number(installment.amount_paid || 0);

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <PageHeader
          title={`${t('Échéance')} ${libellePeriodeEcheance(installment.period_month, installment.period_year)}`}
          subtitle={
            <Space size="small" wrap>
              {getStatusTag(installment.status)}
              <Text strong type={remaining > 0 ? 'danger' : 'success'}>
                {remaining > 0
                  ? t('Reste à payer : {{montant}}', { montant: formatCurrency(remaining, installment.currency) })
                  : t('Échéance soldée')}
              </Text>
            </Space>
          }
          breadcrumbs={[
            { label: t('Baux'), to: `/tenant/${tenantId}/rental/leases` },
            {
              label: installment.lease?.lease_number ?? t('Bail'),
              to: `/tenant/${tenantId}/rental/leases/${installment.lease_id}`
            },
            { label: libellePeriodeEcheance(installment.period_month, installment.period_year) }
          ]}
          extra={
            tenantId && installmentId && ready ? (
              <InstallmentReminderButton
                tenantId={tenantId}
                installmentId={installmentId}
                periodLabel={libellePeriodeEcheance(installment.period_month, installment.period_year)}
                remaining={remaining}
                status={installment.status}
                leaseStatus={installment.lease?.status}
                canAllocate={permissions === null || permissions.has('RENTAL_PAYMENTS_ALLOCATE')}
                onSent={() => setRemindersRefresh(k => k + 1)}
              />
            ) : undefined
          }
        />

        <Row gutter={[24, 24]}>
          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <DollarOutlined />
                  <HelpSectionTitle title={t('Informations financières')} helpId="locatif.echeances.fiche.finances" />
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
                  <HelpSectionTitle title={t('Informations')} helpId="locatif.echeances.fiche.informations" />
                </Space>
              }
            >
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label={t('Période')}>
                  {libellePeriodeEcheance(installment.period_month, installment.period_year)}
                </Descriptions.Item>
                <Descriptions.Item label={t("Date d'échéance")}>{formatDate(installment.due_date)}</Descriptions.Item>
                <Descriptions.Item label={t('Statut')}>{getStatusTag(installment.status)}</Descriptions.Item>
                {installment.paid_at && (
                  <Descriptions.Item label={t('Date de paiement')}>{formatDate(installment.paid_at)}</Descriptions.Item>
                )}
                {/* Le code enregistré (« XOF », « CFA ») ne s'affiche jamais tel quel : « FCFA ». */}
                <Descriptions.Item label={t('Devise')}>{deviseAffichee(installment.currency)}</Descriptions.Item>
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

        {tenantId && installmentId && ready && (
          <InstallmentPaymentLinksPanel
            tenantId={tenantId}
            installmentId={installmentId}
            remaining={remaining}
            status={installment.status}
            leaseStatus={installment.lease?.status}
            canView={permissions === null || permissions.has('RENTAL_PAYMENTS_VIEW')}
            canCreate={permissions === null || permissions.has('RENTAL_PAYMENTS_CREATE')}
            periodLabel={libellePeriodeEcheance(installment.period_month, installment.period_year)}
          />
        )}

        {tenantId && installmentId && ready && (
          <InstallmentRemindersHistoryPanel
            tenantId={tenantId}
            installmentId={installmentId}
            canView={permissions === null || permissions.has('RENTAL_PAYMENTS_VIEW')}
            refreshKey={remindersRefresh}
          />
        )}
      </Space>
    </>
  );
};
