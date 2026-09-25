import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, Descriptions, Row, Space, Spin, Statistic, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, ApartmentOutlined, BankOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { LotTable } from '../../components/syndics/LotTable';
import { getSyndicate } from '../../services/syndic-service';
import { Syndicate } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

const { Paragraph, Title } = Typography;

function statusConfig(): Record<Syndicate['status'], { color: string; label: string }> {
  return {
    ACTIVE: { color: 'green', label: t('Active') },
    IN_LIQUIDATION: { color: 'orange', label: t('En liquidation') },
    IN_DISPUTE: { color: 'red', label: t('En litige') }
  };
}

export const SyndicDetail: React.FC = () => {
  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const navigate = useNavigate();

  const [syndicate, setSyndicate] = useState<Syndicate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres syndic manquants'));
      return;
    }
    void loadSyndicate();
  }, [effectiveTenantId, syndicId]);

  const loadSyndicate = async () => {
    if (!effectiveTenantId || !syndicId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await getSyndicate(effectiveTenantId, syndicId);
      setSyndicate(data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger la copropriété'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      </>
    );
  }

  if (error || !syndicate) {
    return (
      <>
        <Alert
          type="error"
          message={t('Erreur de chargement')}
          description={error || t('Copropriété introuvable')}
          showIcon
        />
      </>
    );
  }

  const status = statusConfig()[syndicate.status];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics`)}>
              {t('Retour à la liste')}
            </Button>
            <Space>
              <Title level={2} style={{ margin: 0 }}>
                {syndicate.name}
              </Title>
              <Tag color={status.color}>{status.label}</Tag>
            </Space>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {syndicate.address}
            </Paragraph>
          </Space>

          <Space>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/prestataires`)}>
              {t('Prestataires')}
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/documents`)}>
              {t('Documents')}
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/finances`)}>
              {t('Finances')}
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/recouvrement`)}>
              {t('Recouvrement')}
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/comptabilite`)}>
              {t('Comptabilité')}
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/budgets`)}>
              {t('Budgets')}
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/profils-incidents`)}>
              Profils/Incidents
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/assemblees`)}>
              {t('Gérer les AG')}
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/charges`)}>
              {t('Gérer les charges')}
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/lots`)}>
              {t('Gérer les lots')}
            </Button>
          </Space>
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title={t('Lots')}
                value={syndicate.lots?.length ?? syndicate._count?.lots ?? syndicate.totalLots}
                prefix={<FolderOpenOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic title={t('Bâtiments')} value={syndicate.totalBuildings} prefix={<ApartmentOutlined />} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title={t('Appels de charges')}
                value={syndicate.chargeCalls?.length ?? syndicate._count?.chargeCalls ?? 0}
                prefix={<BankOutlined />}
              />
            </Card>
          </Col>
        </Row>

        <Card title={t('Informations générales')}>
          <Descriptions column={{ xs: 1, md: 2 }} bordered>
            <Descriptions.Item label={t('Nom')}>{syndicate.name}</Descriptions.Item>
            <Descriptions.Item label={t('Statut')}>
              <Tag color={status.color}>{status.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('Adresse')}>{syndicate.address}</Descriptions.Item>
            <Descriptions.Item label={t('Référence cadastrale')}>
              {syndicate.cadastralReference || t('Non renseignée')}
            </Descriptions.Item>
            <Descriptions.Item label={t('Nombre de lots déclaré')}>
              {syndicate.lots?.length ?? syndicate._count?.lots ?? syndicate.totalLots}
            </Descriptions.Item>
            <Descriptions.Item label={t('Nombre de bâtiments')}>{syndicate.totalBuildings}</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title={t('Résumé des lots')}>
          <LotTable lots={syndicate.lots || []} />
        </Card>
      </Space>
    </>
  );
};
