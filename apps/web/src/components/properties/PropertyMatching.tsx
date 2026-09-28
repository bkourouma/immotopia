import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Col, Descriptions, Empty, Row, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, EyeOutlined, PlusOutlined, SearchOutlined, StarFilled } from '@ant-design/icons';
import { Property } from '../../types/property-types';
import { addPropertyToShortlist, matchPropertiesForDeal } from '../../services/property-service';
import { t } from '../../i18n/t';
import { writeErrorMessage } from '../../utils/error-handler';

import { activeLocale } from '../../i18n/format';
const { Text, Title, Paragraph } = Typography;

interface PropertyMatchResult {
  propertyId: string;
  matchScore: number;
  property: Property;
  explanationText: string;
  explanation: {
    budgetScore: number;
    locationScore: number;
    sizeScore: number;
    featuresScore: number;
    priceCoherenceScore: number;
    reasons: string[];
  };
}

interface PropertyMatchingProps {
  dealId: string;
  tenantId: string;
  onPropertyAdded?: () => void;
}

function formatPrice(price?: number, currency?: string, propertyType?: string): string {
  if (!price) return propertyType === 'IMMEUBLE' ? '' : t('Prix sur demande');
  return `${new Intl.NumberFormat(activeLocale()).format(price)} ${currency || 'EUR'}`;
}

function getScoreTagColor(score: number): string {
  if (score >= 80) return 'success';
  if (score >= 60) return 'gold';
  if (score >= 40) return 'orange';
  return 'error';
}

function toPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export const PropertyMatching: React.FC<PropertyMatchingProps> = ({ dealId, tenantId, onPropertyAdded }) => {
  const { message } = App.useApp();

  const navigate = useNavigate();
  const [matches, setMatches] = useState<PropertyMatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [shortlistedProperties, setShortlistedProperties] = useState<Set<string>>(new Set());

  const handleMatch = async () => {
    setLoading(true);
    try {
      const results = await matchPropertiesForDeal(tenantId, dealId);
      setMatches(results as PropertyMatchResult[]);
      if (!results.length) {
        message.info(t('Aucune correspondance trouvée'));
      }
    } catch (error: any) {
      console.error('Error matching properties:', error);
      message.error(
        writeErrorMessage(
          error,
          t('Erreur lors de la recherche de correspondances'),
          t("Vous n'avez pas les droits nécessaires pour lancer le matching.")
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAddToShortlist = async (propertyId: string, matchScore: number, explanation: unknown) => {
    try {
      await addPropertyToShortlist(tenantId, dealId, propertyId, matchScore, explanation);
      setShortlistedProperties(previous => new Set([...previous, propertyId]));
      message.success(t('Propriété ajoutée à la shortlist'));
      if (onPropertyAdded) onPropertyAdded();
    } catch (error: any) {
      console.error('Error adding to shortlist:', error);
      message.error(
        writeErrorMessage(
          error,
          t("Erreur lors de l'ajout à la shortlist"),
          t("Vous n'avez pas les droits nécessaires pour modifier la shortlist.")
        )
      );
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Row gutter={[16, 16]} justify="space-between" align="middle">
          <Col flex="auto">
            <Title level={5} style={{ margin: 0 }}>
              {t('Recherche de correspondances')}
            </Title>
            <Text type="secondary">
              {t('Trouvez automatiquement les propriétés correspondant aux critères de cette affaire.')}
            </Text>
          </Col>
          <Col>
            <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={handleMatch}>
              {t('Rechercher des correspondances')}
            </Button>
          </Col>
        </Row>
      </Card>

      {matches.length > 0 ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Title level={5} style={{ margin: 0 }}>
            {matches.length} correspondance{matches.length > 1 ? 's' : ''} trouvee{matches.length > 1 ? 's' : ''}
          </Title>

          {matches.map(match => (
            <Card key={match.propertyId}>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Space wrap>
                  <Title level={5} style={{ margin: 0 }}>
                    {match.property.title}
                  </Title>
                  <Tag color={getScoreTagColor(match.matchScore)} icon={<StarFilled />}>
                    {Math.round(match.matchScore)}
                    {t('% de correspondance')}
                  </Tag>
                </Space>

                <Descriptions
                  size="small"
                  column={{ xs: 1, md: 2, lg: 4 }}
                  items={
                    [
                      {
                        key: 'price',
                        label: 'Prix',
                        children: formatPrice(
                          match.property.price,
                          match.property.currency,
                          match.property.propertyType
                        )
                      },
                      match.property.surfaceArea
                        ? {
                            key: 'surface',
                            label: 'Surface',
                            children: `${match.property.surfaceArea} m²`
                          }
                        : null,
                      match.property.rooms
                        ? {
                            key: 'rooms',
                            label: 'Pieces',
                            children: match.property.rooms
                          }
                        : null,
                      match.property.locationZone
                        ? {
                            key: 'zone',
                            label: 'Zone',
                            children: match.property.locationZone
                          }
                        : null
                    ].filter(Boolean) as any
                  }
                />

                <Card size="small" type="inner" title={t('Détails de correspondance')}>
                  <Paragraph style={{ marginBottom: 12 }}>{match.explanationText}</Paragraph>
                  <Row gutter={[12, 12]}>
                    <Col xs={12} md={8} lg={4}>
                      <Text type="secondary">{t('Budget')}</Text>
                      <div>
                        <Text strong>{toPercent(match.explanation.budgetScore)}</Text>
                      </div>
                    </Col>
                    <Col xs={12} md={8} lg={4}>
                      <Text type="secondary">{t('Localisation')}</Text>
                      <div>
                        <Text strong>{toPercent(match.explanation.locationScore)}</Text>
                      </div>
                    </Col>
                    <Col xs={12} md={8} lg={4}>
                      <Text type="secondary">{t('Taille')}</Text>
                      <div>
                        <Text strong>{toPercent(match.explanation.sizeScore)}</Text>
                      </div>
                    </Col>
                    <Col xs={12} md={8} lg={4}>
                      <Text type="secondary">{t('Caractéristiques')}</Text>
                      <div>
                        <Text strong>{toPercent(match.explanation.featuresScore)}</Text>
                      </div>
                    </Col>
                    <Col xs={12} md={8} lg={4}>
                      <Text type="secondary">{t('Cohérence prix')}</Text>
                      <div>
                        <Text strong>{toPercent(match.explanation.priceCoherenceScore)}</Text>
                      </div>
                    </Col>
                  </Row>
                </Card>

                <Space wrap>
                  <Button
                    icon={<EyeOutlined />}
                    onClick={() => navigate(`/tenant/${tenantId}/properties/${match.propertyId}`)}
                  >
                    {t('Voir les détails')}
                  </Button>

                  {shortlistedProperties.has(match.propertyId) ? (
                    <Button icon={<CheckCircleOutlined />} disabled>
                      {t('Ajouté à la shortlist')}
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => handleAddToShortlist(match.propertyId, match.matchScore, match.explanation)}
                    >
                      {t('Ajouter à la shortlist')}
                    </Button>
                  )}
                </Space>
              </Space>
            </Card>
          ))}
        </Space>
      ) : null}

      {matches.length === 0 && !loading ? (
        <Card>
          <Empty
            description={t('Aucune correspondance. Lancez une recherche pour proposer des propriétés.')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      ) : null}
    </Space>
  );
};
