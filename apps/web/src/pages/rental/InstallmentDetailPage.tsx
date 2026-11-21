import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Row, Col, Typography, Spin, Alert, Descriptions, Space, Table } from 'antd';
import { ArrowLeftOutlined, DollarOutlined, CalendarOutlined } from '@ant-design/icons';
import { getInstallment, RentalInstallment, AffectationEcheance } from '../../services/rental-service';
import { InstallmentPaymentLinksPanel } from '../../components/rental/InstallmentPaymentLinksPanel';
import { InstallmentReminderButton } from '../../components/rental/reminders/InstallmentReminderButton';
import { InstallmentRemindersHistoryPanel } from '../../components/rental/reminders/InstallmentRemindersHistoryPanel';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';
import { formatMoney } from '../../components/primitives/MoneyValue';
import { StatusTag } from '../../components/primitives';
import { libelleMethodePaiement } from '../../lib/rental-payment-status';
import { deviseAffichee, libellePeriodeEcheance } from '../../lib/rental-labels';
import { useMyMenuAccess } from '../../hooks/useMenuAccess';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;

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

  // Même pastille que la liste (« À échoir », « Annulé »…) : l'ancienne table locale
  // écrivait « Échéance » pour DUE et le code brut « CANCELED » pour une échéance annulée.
  const getStatusTag = (status: string) => <StatusTag status={status} />;

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
    return (
      <>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" tip={t('Chargement...')} />
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
  // Au centime (virgule flottante : 0,1 + 0,2 - 0,3 ≠ 0) ; une échéance annulée ne doit plus rien.
  const remaining =
    String(installment.status) === 'CANCELED'
      ? 0
      : Math.round((totalDue - Number(installment.amount_paid || 0)) * 100) / 100;
  const affectations = (installment.payments ?? [])
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

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
                {t('Échéance')} {libellePeriodeEcheance(installment.period_month, installment.period_year)}
              </Title>
              <Text type="secondary">{t("Détails de l'échéance")}</Text>
            </div>
          </Space>
          <Space size="middle" wrap>
            {tenantId && installmentId && ready && (
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
            )}
            {getStatusTag(installment.status)}
          </Space>
        </div>

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

        <Card title={t('Paiements affectés')}>
          <Table<AffectationEcheance>
            size="small"
            rowKey={a => a.id}
            pagination={false}
            dataSource={affectations}
            locale={{ emptyText: t('Aucun paiement affecté à cette échéance.') }}
            scroll={{ x: 'max-content' }}
            columns={[
              {
                title: t('Date'),
                key: 'date',
                render: (_, a) => formatDate(a.payment?.succeeded_at ?? a.payment?.initiated_at ?? a.created_at)
              },
              {
                title: t('Mode de paiement'),
                key: 'mode',
                render: (_, a) => (a.payment ? libelleMethodePaiement(a.payment.method) : '-')
              },
              {
                title: t('Statut'),
                key: 'statut',
                render: (_, a) => (a.payment ? <StatusTag status={a.payment.status} /> : '-')
              },
              {
                title: t('Montant affecté'),
                key: 'montant',
                align: 'end',
                render: (_, a) => formatCurrency(Number(a.amount), a.currency || installment.currency)
              }
            ]}
          />
        </Card>

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
