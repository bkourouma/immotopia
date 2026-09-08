import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, Descriptions, Row, Space, Spin, Statistic, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, ApartmentOutlined, BankOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { LotTable } from '../../components/syndics/LotTable';
import { getSyndicate } from '../../services/syndic-service';
import { Syndicate } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';

const { Paragraph, Title } = Typography;

const statusConfig: Record<Syndicate['status'], { color: string; label: string }> = {
  ACTIVE: { color: 'green', label: 'Active' },
  IN_LIQUIDATION: { color: 'orange', label: 'En liquidation' },
  IN_DISPUTE: { color: 'red', label: 'En litige' }
};

export const SyndicDetail: React.FC = () => {
  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const navigate = useNavigate();

  const [syndicate, setSyndicate] = useState<Syndicate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError('Paramètres syndic manquants');
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
      setError(err.response?.data?.error || 'Impossible de charger la copropriété');
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
        <Alert type="error" message="Erreur de chargement" description={error || 'Copropriété introuvable'} showIcon />
      </>
    );
  }

  const status = statusConfig[syndicate.status];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics`)}>
              Retour à la liste
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
              Prestataires
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/documents`)}>
              Documents
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/finances`)}>
              Finances
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/recouvrement`)}>
              Recouvrement
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/comptabilite`)}>
              Comptabilité
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/budgets`)}>
              Budgets
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/profils-incidents`)}>
              Profils/Incidents
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/assemblees`)}>
              Gérer les AG
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/charges`)}>
              Gérer les charges
            </Button>
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicate.id}/lots`)}>
              Gérer les lots
            </Button>
          </Space>
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title="Lots"
                value={syndicate.lots?.length ?? syndicate._count?.lots ?? syndicate.totalLots}
                prefix={<FolderOpenOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic title="Bâtiments" value={syndicate.totalBuildings} prefix={<ApartmentOutlined />} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title="Appels de charges"
                value={syndicate.chargeCalls?.length ?? syndicate._count?.chargeCalls ?? 0}
                prefix={<BankOutlined />}
              />
            </Card>
          </Col>
        </Row>

        <Card title="Informations générales">
          <Descriptions column={{ xs: 1, md: 2 }} bordered>
            <Descriptions.Item label="Nom">{syndicate.name}</Descriptions.Item>
            <Descriptions.Item label="Statut">
              <Tag color={status.color}>{status.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Adresse">{syndicate.address}</Descriptions.Item>
            <Descriptions.Item label="Référence cadastrale">
              {syndicate.cadastralReference || 'Non renseignée'}
            </Descriptions.Item>
            <Descriptions.Item label="Nombre de lots déclaré">
              {syndicate.lots?.length ?? syndicate._count?.lots ?? syndicate.totalLots}
            </Descriptions.Item>
            <Descriptions.Item label="Nombre de bâtiments">{syndicate.totalBuildings}</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="Résumé des lots">
          <LotTable lots={syndicate.lots || []} />
        </Card>
      </Space>
    </>
  );
};
