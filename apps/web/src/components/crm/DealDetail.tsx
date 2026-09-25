import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography
} from 'antd';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  DollarOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  HomeOutlined,
  MailOutlined,
  PhoneOutlined,
  ThunderboltOutlined,
  UserOutlined
} from '@ant-design/icons';
import type { CrmDealStage } from '../../types/crm-types';
import { getDeal, updateDeal, CrmDealDetail, UpdateCrmDealRequest } from '../../services/crm-service';
import { ActivityTimeline } from './ActivityTimeline';
import { PropertyMatching } from '../properties/PropertyMatching';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;

interface DealDetailProps {
  tenantId: string;
  dealId: string;
}

function STAGE_OPTIONS(): Array<{ value: CrmDealStage; label: string }> {
  return [
    { value: 'NEW', label: t('Nouveau') },
    { value: 'QUALIFIED', label: t('Qualifie') },
    { value: 'VISIT', label: t('Visite') },
    { value: 'NEGOTIATION', label: t('Negociation') },
    { value: 'WON', label: t('Gagne') },
    { value: 'LOST', label: t('Perdu') }
  ];
}

function FURNISHING_LABELS(): Record<string, string> {
  return {
    MEUBLE: t('Meuble'),
    SEMI_MEUBLE: t('Semi-meuble'),
    NON_MEUBLE: t('Non meuble')
  };
}

function getStageLabel(stage: string): string {
  return STAGE_OPTIONS().find(s => s.value === stage)?.label || stage;
}

function getStageColor(stage: string): string {
  const map: Record<string, string> = {
    NEW: 'default',
    QUALIFIED: 'blue',
    VISIT: 'orange',
    NEGOTIATION: 'purple',
    WON: 'green',
    LOST: 'red'
  };
  return map[stage] || 'default';
}

function getDealTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    ACHAT: 'Achat',
    LOCATION: 'Location',
    VENTE: 'Vente',
    GESTION: 'Gestion',
    MANDAT: 'Mandat'
  };
  return labels[type] || type;
}

function getPropertyTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    APPARTEMENT: 'Appartement',
    VILLA: 'Villa',
    MAISON: 'Maison',
    TERRAIN: 'Terrain',
    BUREAU: 'Bureau',
    COMMERCE: t('Local commercial'),
    STUDIO: 'Studio',
    DUPLEX: 'Duplex',
    PENTHOUSE: 'Penthouse',
    AUTRE: 'Autre'
  };
  return labels[type] || type;
}

function formatNumber(value?: number): string {
  if (value === undefined || value === null) return '';
  return value.toLocaleString(activeLocale()).replace(/,/g, ' ');
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export const DealDetail: React.FC<DealDetailProps> = ({ tenantId, dealId }) => {
  const { message } = App.useApp();

  const navigate = useNavigate();
  const [deal, setDeal] = useState<CrmDealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStage, setUpdatingStage] = useState(false);

  useEffect(() => {
    void loadDeal();
  }, [tenantId, dealId]);

  const loadDeal = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getDeal(tenantId, dealId);
      if (response.success) {
        setDeal(response.data);
      } else {
        setError(t("Erreur lors du chargement de l'affaire"));
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || t("Erreur lors du chargement de l'affaire"));
    } finally {
      setLoading(false);
    }
  };

  const handleStageChange = async (newStage: string) => {
    if (!deal) return;
    setUpdatingStage(true);
    try {
      const updateData: UpdateCrmDealRequest = {
        stage: newStage as CrmDealStage,
        version: deal.version
      };
      const response = await updateDeal(tenantId, dealId, updateData);
      if (response.success) {
        setDeal(response.data as CrmDealDetail);
        message.success(t('Stade de l affaire mis a jour'));
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("Erreur lors de la mise a jour du stade de l'affaire"));
    } finally {
      setUpdatingStage(false);
    }
  };

  const criteria = (deal?.criteriaJson as Record<string, any>) || {};

  const specificCriteria = useMemo(() => {
    const rows: Array<{ label: string; value: string }> = [];
    if (hasValue(criteria.rooms)) rows.push({ label: t('Nombre de pieces'), value: String(criteria.rooms) });
    if (hasValue(criteria.surface)) rows.push({ label: t('Surface'), value: `${criteria.surface} m²` });
    if (hasValue(criteria.landArea)) rows.push({ label: t('Surface du terrain'), value: `${criteria.landArea} m²` });
    if (hasValue(criteria.furnishingStatus)) {
      rows.push({
        label: t('Etat du meuble'),
        value: FURNISHING_LABELS()[String(criteria.furnishingStatus)] || String(criteria.furnishingStatus)
      });
    }
    if (hasValue(criteria.floor)) rows.push({ label: t('Etage'), value: String(criteria.floor) });
    if (hasValue(criteria.officeCount))
      rows.push({ label: t('Nombre de bureaux'), value: String(criteria.officeCount) });
    if (hasValue(criteria.commercialType))
      rows.push({ label: t('Type de commerce'), value: String(criteria.commercialType) });
    return rows;
  }, [criteria]);

  const equipmentTags = useMemo(() => {
    const tags: string[] = [];
    if (criteria.hasGarden) tags.push('Jardin');
    if (criteria.hasPool) tags.push('Piscine');
    if (criteria.hasGarage) tags.push('Garage');
    if (criteria.hasParking) tags.push('Parking');
    if (criteria.hasElevator) tags.push('Ascenseur');
    if (criteria.hasBalcony) tags.push('Balcon');
    if (criteria.hasStorefront) tags.push('Vitrine');
    if (criteria.hasReception) tags.push('Reception');
    if (criteria.hasTerrace) tags.push('Terrasse');
    return tags;
  }, [criteria]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <Spin size="large" />
        <div style={{ marginTop: 12 }}>
          <Text type="secondary">{t('Chargement de l affaire...')}</Text>
        </div>
      </div>
    );
  }

  if (error) {
    return <Alert type="error" showIcon message={error} />;
  }

  if (!deal) {
    return <Empty description={t('Affaire non trouvee')} />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Row gutter={[16, 16]} justify="space-between" align="top">
          <Col flex="auto">
            <Space align="center" wrap>
              <Title level={2} style={{ margin: 0 }}>
                {getDealTypeLabel(deal.type)}
              </Title>
              <Tag color={getStageColor(deal.stage)}>{getStageLabel(deal.stage)}</Tag>
            </Space>

            <Descriptions
              size="small"
              column={{ xs: 1, md: 2 }}
              style={{ marginTop: 16 }}
              items={
                [
                  deal.contact
                    ? {
                        key: 'contact',
                        label: (
                          <Space>
                            <UserOutlined />
                            {t('Contact')}
                          </Space>
                        ),
                        children: `${deal.contact.firstName || ''} ${deal.contact.lastName || ''}`.trim() || '—'
                      }
                    : null,
                  deal.contact?.email
                    ? {
                        key: 'email',
                        label: (
                          <Space>
                            <MailOutlined />
                            {t('Email')}
                          </Space>
                        ),
                        children: deal.contact.email
                      }
                    : null,
                  deal.contact?.phonePrimary || deal.contact?.phone
                    ? {
                        key: 'phone',
                        label: (
                          <Space>
                            <PhoneOutlined />
                            {t('Telephone')}
                          </Space>
                        ),
                        children: deal.contact?.phonePrimary || deal.contact?.phone
                      }
                    : null,
                  deal.locationZone
                    ? {
                        key: 'zone',
                        label: (
                          <Space>
                            <EnvironmentOutlined />
                            {t('Zone')}
                          </Space>
                        ),
                        children: deal.locationZone
                      }
                    : null,
                  deal.budgetMin || deal.budgetMax
                    ? {
                        key: 'budget',
                        label: (
                          <Space>
                            <DollarOutlined />
                            {t('Budget')}
                          </Space>
                        ),
                        children:
                          deal.budgetMin && deal.budgetMax
                            ? `${formatNumber(deal.budgetMin)} - ${formatNumber(deal.budgetMax)} FCFA`
                            : deal.budgetMax
                              ? t('Jusqu a {{value}} FCFA', { value: formatNumber(deal.budgetMax) })
                              : t('A partir de {{value}} FCFA', { value: formatNumber(deal.budgetMin) })
                      }
                    : null,
                  {
                    key: 'createdAt',
                    label: (
                      <Space>
                        <CalendarOutlined />
                        {t('Cree le')}
                      </Space>
                    ),
                    children: new Date(deal.createdAt).toLocaleDateString(activeLocale())
                  },
                  {
                    key: 'updatedAt',
                    label: t('Modifie le'),
                    children: new Date(deal.updatedAt).toLocaleDateString(activeLocale())
                  }
                ].filter(Boolean) as any
              }
            />
          </Col>

          <Col>
            <Space direction="vertical" size="small" style={{ minWidth: 220 }}>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/tenant/${tenantId}/crm/deals`)}>
                {t('Retour')}
              </Button>
              <Select
                value={deal.stage}
                options={STAGE_OPTIONS()}
                onChange={handleStageChange}
                loading={updatingStage}
              />
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => navigate(`/tenant/${tenantId}/crm/deals/${dealId}/edit`)}
              >
                {t('Modifier')}
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {(hasValue(criteria.propertyType) ||
        hasValue(deal.expectedValue) ||
        specificCriteria.length > 0 ||
        equipmentTags.length > 0) && (
        <Card
          title={
            <Space>
              <HomeOutlined />
              {t('Type de bien et criteres')}
            </Space>
          }
        >
          <Row gutter={[16, 16]}>
            {hasValue(criteria.propertyType) ? (
              <Col xs={24} md={12}>
                <Text type="secondary">{t('Type de bien recherche')}</Text>
                <div>
                  <Text strong>{getPropertyTypeLabel(String(criteria.propertyType))}</Text>
                </div>
              </Col>
            ) : null}

            {hasValue(deal.expectedValue) ? (
              <Col xs={24} md={12}>
                <Text type="secondary">{t('Valeur estimee de la transaction')}</Text>
                <div>
                  <Text strong>{formatNumber(deal.expectedValue)} FCFA</Text>
                </div>
              </Col>
            ) : null}
          </Row>

          {specificCriteria.length > 0 ? (
            <>
              <div style={{ margin: '16px 0' }}>
                <Divider style={{ margin: 0 }} />
              </div>
              <Descriptions
                size="small"
                column={{ xs: 1, md: 2, lg: 3 }}
                items={specificCriteria.map((item, index) => ({
                  key: `${item.label}-${index}`,
                  label: item.label,
                  children: item.value
                }))}
              />
            </>
          ) : null}

          {equipmentTags.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <Text type="secondary">{t('Equipements')}</Text>
              <div style={{ marginTop: 8 }}>
                <Space wrap>
                  {equipmentTags.map(item => (
                    <Tag key={item}>{item}</Tag>
                  ))}
                </Space>
              </div>
            </div>
          ) : null}
        </Card>
      )}

      {hasValue(criteria.description) ? (
        <Card
          title={
            <Space>
              <FileTextOutlined />
              {t('Description / Besoins specifiques')}
            </Space>
          }
        >
          <Text>{String(criteria.description)}</Text>
        </Card>
      ) : null}

      <Card
        title={
          <Space>
            <ThunderboltOutlined />
            {t('Chronologie des activites')} {deal.activities ? `(${deal.activities.length})` : ''}
          </Space>
        }
      >
        {deal.activities && deal.activities.length > 0 ? (
          <ActivityTimeline activities={deal.activities} tenantId={tenantId} />
        ) : (
          <Empty description={t('Aucune activite')} />
        )}
      </Card>

      <Card title={t('Correspondance de proprietes')}>
        <PropertyMatching tenantId={tenantId} dealId={dealId} />
      </Card>
    </Space>
  );
};
