import React, { useEffect, useMemo, useState } from 'react';
import { contactDisplayName } from '../../utils/contact-display';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Col, Descriptions, Divider, Empty, Row, Select, Space, Tag, Typography } from 'antd';
import {
  ArrowRightOutlined,
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
import { PageHeader, StateBlock, SkeletonDetail, StepRail, useConfirmAction } from '../primitives';
import { getDeal, updateDeal, CrmDealDetail, UpdateCrmDealRequest } from '../../services/crm-service';
import { ActivityTimeline } from './ActivityTimeline';
import { PropertyMatching } from '../properties/PropertyMatching';
import { t } from '../../i18n/t';
import { HelpSectionTitle, HelpButton } from '../../help';
import { dealStageLabel, dealTypeLabel } from '../../utils/crm-labels';

import { activeLocale } from '../../i18n/format';
import { localizedRecord } from '../../i18n/localized';
const { Text } = Typography;

interface DealDetailProps {
  tenantId: string;
  dealId: string;
}

const STAGE_CODES: CrmDealStage[] = ['NEW', 'QUALIFIED', 'VISIT', 'NEGOTIATION', 'WON', 'LOST'];

/** Parcours normal d'une affaire : « Perdue » en sort, elle n'en fait pas partie. */
const STAGE_PATH: CrmDealStage[] = ['NEW', 'QUALIFIED', 'VISIT', 'NEGOTIATION', 'WON'];

// Construit à l'affichage : `t()` suit la langue courante.
const stageOptions = (): Array<{ value: CrmDealStage; label: string }> =>
  STAGE_CODES.map(value => ({ value, label: dealStageLabel(value) }));

const FURNISHING_LABELS: Record<string, string> = localizedRecord(() => ({
  MEUBLE: 'Meuble',
  SEMI_MEUBLE: 'Semi-meuble',
  NON_MEUBLE: t('Non meuble')
}));

function getStageLabel(stage: string): string {
  return dealStageLabel(stage);
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
  return dealTypeLabel(type);
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
  const confirm = useConfirmAction();
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
      setError(t('Impossible de charger cette affaire. Vérifiez votre connexion puis réessayez.'));
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
        // La réponse du PATCH est allégée (ni téléphone du contact, ni activités) :
        // on la fusionne avec le détail déjà chargé au lieu de le remplacer.
        const updated = response.data as CrmDealDetail;
        setDeal(previous =>
          previous
            ? {
                ...previous,
                ...updated,
                contact: { ...previous.contact, ...updated.contact } as CrmDealDetail['contact'],
                activities: updated.activities ?? previous.activities
              }
            : updated
        );
        message.success(t("Stade de l'affaire mis à jour"));
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("Erreur lors de la mise à jour du stade de l'affaire"));
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
        value: FURNISHING_LABELS[String(criteria.furnishingStatus)] || String(criteria.furnishingStatus)
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

  if (loading && !deal) {
    return <SkeletonDetail aria-label={t("Chargement de l'affaire...")} />;
  }

  if (error) {
    return <StateBlock variant="error" description={error} onRetry={() => void loadDeal()} />;
  }

  if (!deal) {
    return (
      <StateBlock
        variant="empty"
        title={t('Affaire non trouvée')}
        description={t("Cette affaire n'existe plus ou n'appartient pas à votre agence.")}
        actions={[
          {
            label: t('Retour aux affaires'),
            onClick: () => navigate(`/tenant/${tenantId}/crm/deals`),
            primary: true
          }
        ]}
      />
    );
  }

  const stageIndex = STAGE_PATH.indexOf(deal.stage as CrmDealStage);
  const nextStage = stageIndex >= 0 && stageIndex < STAGE_PATH.length - 1 ? STAGE_PATH[stageIndex + 1] : null;
  const typeLabel = getDealTypeLabel(deal.type);
  const phoneToCall = deal.contact?.phonePrimary || deal.contact?.phone;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <PageHeader
        title={typeLabel}
        subtitle={<Tag color={getStageColor(deal.stage)}>{getStageLabel(deal.stage)}</Tag>}
        breadcrumbs={[{ label: t('Affaires'), to: `/tenant/${tenantId}/crm/deals` }, { label: typeLabel }]}
        helpId="commercial.affaires.detail.etape"
        primaryAction={
          nextStage
            ? {
                label: t('Passer à « {{etape}} »', { etape: getStageLabel(nextStage) }),
                icon: <ArrowRightOutlined />,
                onClick: () => {
                  // Conclure l'affaire est un geste lourd : une confirmation évite le clic malheureux.
                  if (nextStage === 'WON') {
                    confirm({
                      title: t("Marquer l'affaire « {{etape}} » ?", { etape: getStageLabel(nextStage) }),
                      description: t("Vous pourrez la remettre dans une autre étape depuis la liste de l'étape."),
                      okText: t('Confirmer'),
                      onConfirm: () => handleStageChange(nextStage)
                    });
                    return;
                  }
                  void handleStageChange(nextStage);
                },
                loading: updatingStage
              }
            : {
                label: t('Modifier'),
                icon: <EditOutlined />,
                onClick: () => navigate(`/tenant/${tenantId}/crm/deals/${dealId}/edit`)
              }
        }
        secondaryActions={
          nextStage
            ? [
                {
                  key: 'edit',
                  icon: <EditOutlined />,
                  label: t('Modifier'),
                  onClick: () => navigate(`/tenant/${tenantId}/crm/deals/${dealId}/edit`)
                }
              ]
            : undefined
        }
        extra={
          <Select
            showSearch
            optionFilterProp="label"
            aria-label={t("Étape de l'affaire")}
            style={{ minWidth: 180 }}
            value={deal.stage}
            options={stageOptions()}
            onChange={handleStageChange}
            loading={updatingStage}
            disabled={updatingStage}
          />
        }
      />

      {/* Étape courante : le parcours complet, pour savoir où l'on en est et ce qui reste */}
      {stageIndex >= 0 ? (
        <Card>
          <StepRail items={STAGE_PATH.map(stage => ({ title: getStageLabel(stage) }))} current={stageIndex} />
        </Card>
      ) : (
        <Card>
          <Tag color={getStageColor(deal.stage)}>{getStageLabel(deal.stage)}</Tag>
        </Card>
      )}

      <Card>
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
                    children: contactDisplayName(deal.contact)
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
                    children: <a href={`mailto:${deal.contact.email}`}>{deal.contact.email}</a>
                  }
                : null,
              deal.contact?.phonePrimary || deal.contact?.phone
                ? {
                    key: 'phone',
                    label: (
                      <Space>
                        <PhoneOutlined />
                        {t('Téléphone')}
                      </Space>
                    ),
                    children: <a href={`tel:${phoneToCall}`}>{phoneToCall}</a>
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
                          ? t("Jusqu'à {{value}} FCFA", { value: formatNumber(deal.budgetMax) })
                          : t('À partir de {{value}} FCFA', { value: formatNumber(deal.budgetMin) })
                  }
                : null,
              {
                key: 'createdAt',
                label: (
                  <Space>
                    <CalendarOutlined />
                    {t('Créé le')}
                  </Space>
                ),
                children: new Date(deal.createdAt).toLocaleDateString(activeLocale())
              },
              {
                key: 'updatedAt',
                label: t('Modifié le'),
                children: new Date(deal.updatedAt).toLocaleDateString(activeLocale())
              }
            ].filter(Boolean) as any
          }
        />
      </Card>

      {(hasValue(criteria.propertyType) ||
        hasValue(deal.expectedValue) ||
        specificCriteria.length > 0 ||
        equipmentTags.length > 0) && (
        <Card
          title={
            <Space>
              <HomeOutlined />
              <HelpSectionTitle title={t('Type de bien et critères')} helpId="commercial.affaires.detail.criteres" />
            </Space>
          }
        >
          <Row gutter={[16, 16]}>
            {hasValue(criteria.propertyType) ? (
              <Col xs={24} md={12}>
                <Text type="secondary">{t('Type de bien recherché')}</Text>
                <div>
                  <Text strong>{getPropertyTypeLabel(String(criteria.propertyType))}</Text>
                </div>
              </Col>
            ) : null}

            {hasValue(deal.expectedValue) ? (
              <Col xs={24} md={12}>
                <Text type="secondary">{t('Valeur estimée de la transaction')}</Text>
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
              <Text type="secondary">{t('Équipements')}</Text>
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
              {t('Description / Besoins spécifiques')}
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
            {t('Chronologie des activités')} {deal.activities ? `(${deal.activities.length})` : ''}
            <HelpButton helpId="commercial.affaires.detail.chronologie" size="small" />
          </Space>
        }
      >
        {deal.activities && deal.activities.length > 0 ? (
          <ActivityTimeline activities={deal.activities} tenantId={tenantId} />
        ) : (
          <Empty description={t('Aucune activité')} />
        )}
      </Card>

      <Card
        title={
          <HelpSectionTitle
            title={t('Correspondance de propriétés')}
            helpId="commercial.affaires.detail.correspondance"
          />
        }
      >
        <PropertyMatching tenantId={tenantId} dealId={dealId} />
      </Card>
    </Space>
  );
};
