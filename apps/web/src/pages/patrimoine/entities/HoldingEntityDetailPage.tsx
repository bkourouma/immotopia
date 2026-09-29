import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Card, Select, Space, Tag, Typography } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addEntityHolding,
  getEntityConsolidation,
  getEntityTaxEstimate,
  getHoldingEntity,
  removeEntityHolding,
  updateEntityHolding,
  updateHoldingEntity
} from '../../../services/patrimoine-entities-service';
import { useAuth } from '../../../hooks/useAuth';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { PageHeader, StateBlock, SkeletonDetail } from '../../../components/primitives';
import { EntityHoldingsTable } from '../../../components/patrimoine/entities/EntityHoldingsTable';
import { EntityConsolidationCard } from '../../../components/patrimoine/entities/EntityConsolidationCard';
import { TaxEstimateCard } from '../../../components/patrimoine/entities/TaxEstimateCard';
import { TaxDisclaimer } from '../../../components/patrimoine/entities/TaxDisclaimer';
import { HoldingEntityFormModal } from '../../../components/patrimoine/entities/HoldingEntityFormModal';
import {
  fiscalCountryLabel,
  fiscalOwnerKindLabel,
  legalFormLabel
} from '../../../components/patrimoine/entities/tax-labels';
import { t } from '../../../i18n/t';
import { apiErrorMessage } from '../../../components/patrimoine/patrimoine-labels';

const { Text, Title } = Typography;

const CURRENT_YEAR = new Date().getFullYear();

/**
 * `<HoldingEntityDetailPage>` — fiche d'une entité détentrice : identité,
 * hiérarchie, biens rattachés, consolidation et estimation fiscale par année.
 */
export const HoldingEntityDetailPage: React.FC = () => {
  const { tenantId, entityId } = useParams<{ tenantId: string; entityId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const agence = tenantId || tenantMembership?.tenantId;

  const [year, setYear] = useState(CURRENT_YEAR);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: queryKey('holding-entity-detail', agence, { entityId }),
    queryFn: () => getHoldingEntity(agence as string, entityId as string),
    enabled: Boolean(agence && entityId),
    staleTime: STALE_TIME.list
  });

  const consolidationQuery = useQuery({
    queryKey: queryKey('holding-entity-consolidation', agence, { entityId }),
    queryFn: () => getEntityConsolidation(agence as string, entityId as string),
    enabled: Boolean(agence && entityId),
    staleTime: STALE_TIME.list
  });

  const taxEstimateQuery = useQuery({
    queryKey: queryKey('holding-entity-tax-estimate', agence, { entityId, year }),
    queryFn: () => getEntityTaxEstimate(agence as string, entityId as string, year),
    enabled: Boolean(agence && entityId),
    staleTime: STALE_TIME.list
  });

  const invalidateDetail = () =>
    queryClient.invalidateQueries({ queryKey: queryKey('holding-entity-detail', agence, { entityId }) });
  const invalidateConsolidation = () =>
    queryClient.invalidateQueries({ queryKey: queryKey('holding-entity-consolidation', agence, { entityId }) });
  const invalidateTaxEstimate = () =>
    queryClient.invalidateQueries({ queryKey: ['holding-entity-tax-estimate', agence ?? null] });

  if (!agence || !entityId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  if (detailQuery.isPending) {
    return <SkeletonDetail aria-label={t('Entité en cours de chargement')} />;
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <StateBlock
        variant="error"
        description={t('Impossible de charger cette entité.')}
        actions={[{ label: t('Réessayer'), onClick: () => detailQuery.refetch(), primary: true }]}
      />
    );
  }

  const entity = detailQuery.data;

  return (
    <>
      <PageHeader
        title={entity.name}
        subtitle={`${legalFormLabel(entity.legalForm)} — ${fiscalCountryLabel(entity.country)}`}
        breadcrumbs={[
          { label: t('Patrimoine'), to: `/tenant/${agence}/patrimoine` },
          { label: t('Entités détentrices'), to: `/tenant/${agence}/patrimoine/entities` },
          { label: entity.name }
        ]}
        primaryAction={{ label: t('Modifier'), onClick: () => setEditModalOpen(true) }}
      />

      <Card title={t('Identité')} style={{ marginBottom: 'var(--space-4)' }}>
        <Space orientation="vertical" size={4}>
          <Text>
            {t('Statut fiscal effectif')} : {fiscalOwnerKindLabel(entity.effectiveOwnerKind)}
          </Text>
          {entity.rccm && (
            <Text>
              {t('RCCM')} : {entity.rccm}
            </Text>
          )}
          {entity.taxId && (
            <Text>
              {t('NCC / NIF')} : {entity.taxId}
            </Text>
          )}
          {entity.contact && (
            <Text>
              {t('Contact')} : {entity.contact.displayName}
            </Text>
          )}
          {entity.notes && <Text type="secondary">{entity.notes}</Text>}
          {!entity.isActive && <Tag>{t('Inactive')}</Tag>}
        </Space>
      </Card>

      <Card title={t('Hiérarchie')} style={{ marginBottom: 'var(--space-4)' }}>
        <Space orientation="vertical" size={4}>
          <Text>
            {t('Entité mère')} :{' '}
            {entity.parentEntity ? (
              <a onClick={() => navigate(`/tenant/${agence}/patrimoine/entities/${entity.parentEntity!.id}`)}>
                {entity.parentEntity.name}
              </a>
            ) : (
              '—'
            )}
          </Text>
          <Text>{t('Filiales')} :</Text>
          {entity.children.length === 0 ? (
            <Text type="secondary">{t('Aucune filiale')}</Text>
          ) : (
            <Space wrap>
              {entity.children.map(child => (
                <a key={child.id} onClick={() => navigate(`/tenant/${agence}/patrimoine/entities/${child.id}`)}>
                  <Tag>{child.name}</Tag>
                </a>
              ))}
            </Space>
          )}
        </Space>
      </Card>

      <Card title={t('Biens rattachés')} style={{ marginBottom: 'var(--space-4)' }}>
        <EntityHoldingsTable
          tenantId={agence}
          holdings={entity.holdings}
          onAdd={async payload => {
            await addEntityHolding(agence, entityId, payload);
            await Promise.all([invalidateDetail(), invalidateConsolidation(), invalidateTaxEstimate()]);
          }}
          onUpdate={async (holdingId, payload) => {
            try {
              await updateEntityHolding(agence, entityId, holdingId, payload);
              await Promise.all([invalidateDetail(), invalidateConsolidation(), invalidateTaxEstimate()]);
            } catch (error) {
              message.error(apiErrorMessage(error, t('Impossible de modifier ce rattachement.')));
            }
          }}
          onRemove={async holdingId => {
            await removeEntityHolding(agence, entityId, holdingId);
            await Promise.all([invalidateDetail(), invalidateConsolidation(), invalidateTaxEstimate()]);
          }}
        />
      </Card>

      <Card title={t('Consolidation')} style={{ marginBottom: 'var(--space-4)' }}>
        {consolidationQuery.isPending ? (
          <SkeletonDetail aria-label={t('Consolidation en cours de chargement')} />
        ) : consolidationQuery.error ? (
          <StateBlock
            variant="error"
            description={t('Impossible de charger la consolidation.')}
            actions={[{ label: t('Réessayer'), onClick: () => consolidationQuery.refetch(), primary: true }]}
          />
        ) : consolidationQuery.data ? (
          <EntityConsolidationCard data={consolidationQuery.data} />
        ) : null}
      </Card>

      <Card
        title={t('Estimation fiscale')}
        extra={
          <Select
            value={year}
            style={{ width: 120 }}
            onChange={setYear}
            options={Array.from({ length: 6 }, (_, i) => CURRENT_YEAR + 2 - i).map(y => ({ value: y, label: y }))}
            aria-label={t('Année fiscale')}
          />
        }
      >
        <TaxDisclaimer />
        {taxEstimateQuery.isPending ? (
          <SkeletonDetail aria-label={t('Estimation en cours de chargement')} />
        ) : taxEstimateQuery.error ? (
          <StateBlock
            variant="error"
            description={t("Impossible de charger l'estimation fiscale.")}
            actions={[{ label: t('Réessayer'), onClick: () => taxEstimateQuery.refetch(), primary: true }]}
          />
        ) : taxEstimateQuery.data ? (
          <div>
            <Title level={5}>
              {t('Total impôt foncier {{montant}} FCFA — Total impôt sur les revenus fonciers {{montant2}} FCFA', {
                montant: taxEstimateQuery.data.totals.PROPERTY_TAX.toLocaleString('fr-FR'),
                montant2: taxEstimateQuery.data.totals.RENTAL_INCOME_TAX.toLocaleString('fr-FR')
              })}
            </Title>
            {!taxEstimateQuery.data.allParametersValidated && <Tag color="warning">{t('Paramètres à valider')}</Tag>}
            {taxEstimateQuery.data.parameters
              .filter(param => param.fallback)
              .map(param => (
                <Text key={param.country} type="secondary" style={{ display: 'block' }}>
                  {t(
                    'Aucun paramètre fiscal {{pays}} pour {{annee}} : utilisation des derniers paramètres disponibles.',
                    { pays: fiscalCountryLabel(param.country), annee: year }
                  )}
                </Text>
              ))}
            {taxEstimateQuery.data.properties.map(property => (
              <Card
                key={property.propertyId}
                type="inner"
                title={property.title}
                style={{ marginTop: 'var(--space-3)' }}
              >
                <Space orientation="vertical" size={4} style={{ marginBottom: 'var(--space-2)' }}>
                  <Text type="secondary">
                    {property.internalReference} — {property.sharePercent} %
                    {property.partialYear && (
                      <Tag style={{ marginInlineStart: 'var(--space-2)' }}>{t('Année partielle')}</Tag>
                    )}
                  </Text>
                </Space>
                <TaxEstimateCard computations={property.taxes} fiscalYear={year} />
              </Card>
            ))}
          </div>
        ) : null}
      </Card>

      <HoldingEntityFormModal
        open={editModalOpen}
        tenantId={agence}
        entity={entity}
        entities={[]}
        onClose={() => setEditModalOpen(false)}
        onSubmit={async payload => {
          await updateHoldingEntity(agence, entityId, payload);
          message.success(t('Entité modifiée.'));
          await invalidateDetail();
        }}
      />
    </>
  );
};
