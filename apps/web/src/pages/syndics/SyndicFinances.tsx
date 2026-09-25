import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, Row, Space, Spin, Statistic, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { SyndicateFundWidget } from '../../components/syndics/SyndicateFundWidget';
import { getSyndicFinanceSummary } from '../../services/syndic-service';
import { FinanceSummary } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

const { Paragraph, Title } = Typography;

export const SyndicFinances: React.FC = () => {
  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres finances manquants'));
      return;
    }
    void loadSummary();
  }, [effectiveTenantId, syndicId]);

  const loadSummary = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getSyndicFinanceSummary(effectiveTenantId, syndicId);
      setSummary(data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger la synthese financiere'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space direction="vertical" size={4}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicId}`)}
          >
            {t('Retour à la fiche syndic')}
          </Button>
          <Title level={2} style={{ margin: 0 }}>
            {t('Finances copropriété')}
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {t('Soldes des fonds, appels émis, paiements et impayés.')}
          </Paragraph>
        </Space>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {loading || !summary ? (
          <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic title={t('Total fonds')} value={summary.totals.totalFundsBalance} suffix="FCFA" />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic title={t('Total appele')} value={summary.totals.totalCalled} suffix="FCFA" />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic title={t('Total paye')} value={summary.totals.totalPaid} suffix="FCFA" />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic title={t('Reste a payer')} value={summary.totals.totalOutstanding} suffix="FCFA" />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic title={t('Dossiers en retard')} value={summary.totals.overdueCount} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic title={t('Montant en retard')} value={summary.totals.overdueAmount} suffix="FCFA" />
                </Card>
              </Col>
            </Row>

            <Card title={t('Fonds de copropriété')}>
              <SyndicateFundWidget funds={summary.funds} />
            </Card>
          </>
        )}
      </Space>
    </>
  );
};
