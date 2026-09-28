import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Card, Select, Space, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createHoldingEntity,
  deleteHoldingEntity,
  listHoldingEntities,
  updateHoldingEntity
} from '../../../services/patrimoine-entities-service';
import type {
  CreateHoldingEntityInput,
  FiscalCountry,
  HoldingEntityForm as HoldingEntityFormValue,
  HoldingEntitySummary
} from '../../../types/patrimoine-entities-types';
import { useAuth } from '../../../hooks/useAuth';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { PageHeader, StateBlock, SkeletonList, ConfirmAction } from '../../../components/primitives';
import { HoldingEntityFormModal } from '../../../components/patrimoine/entities/HoldingEntityFormModal';
import {
  fiscalCountryLabel,
  fiscalCountryOptions,
  legalFormLabel,
  legalFormOptions
} from '../../../components/patrimoine/entities/tax-labels';
import { t } from '../../../i18n/t';
import { apiErrorMessage } from '../../../components/patrimoine/patrimoine-labels';

const { Text } = Typography;

/**
 * `<HoldingEntitiesPage>` — liste des entités détentrices (SCI, holdings…)
 * d'une agence : filtres, création, modification, suppression.
 */
export const HoldingEntitiesPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const agence = tenantId || tenantMembership?.tenantId;

  const [legalForm, setLegalForm] = useState<HoldingEntityFormValue | undefined>();
  const [country, setCountry] = useState<FiscalCountry | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HoldingEntitySummary | null>(null);

  const filters = { legalForm, country };

  const entitiesQuery = useQuery({
    queryKey: queryKey('holding-entities', agence, filters),
    queryFn: () => listHoldingEntities(agence as string, filters),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKey('holding-entities', agence) });

  const handleSubmit = async (payload: CreateHoldingEntityInput) => {
    if (!agence) return;
    if (editing) {
      await updateHoldingEntity(agence, editing.id, payload);
      message.success(t('Entité modifiée.'));
    } else {
      await createHoldingEntity(agence, payload);
      message.success(t('Entité créée.'));
    }
    await invalidate();
  };

  const handleDelete = async (entity: HoldingEntitySummary) => {
    if (!agence) return;
    try {
      await deleteHoldingEntity(agence, entity.id);
      message.success(t('Entité supprimée.'));
      await invalidate();
    } catch (error) {
      message.error(apiErrorMessage(error, t('Impossible de supprimer cette entité : des biens y sont rattachés.')));
    }
  };

  if (!agence) {
    return (
      <StateBlock
        variant="empty"
        title={t('Aucune agence sélectionnée')}
        description={t('Votre compte doit être rattaché à une agence pour consulter ses entités détentrices.')}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={t('Entités détentrices')}
        subtitle={t('SCI, holdings et sociétés qui portent le patrimoine')}
        primaryAction={{
          label: t('Nouvelle entité'),
          icon: <PlusOutlined />,
          onClick: () => {
            setEditing(null);
            setModalOpen(true);
          }
        }}
        extra={
          <Space wrap>
            <Select
              allowClear
              placeholder={t('Forme juridique')}
              style={{ width: 180 }}
              value={legalForm}
              options={legalFormOptions()}
              onChange={setLegalForm}
            />
            <Select
              allowClear
              placeholder={t('Pays')}
              style={{ width: 160 }}
              value={country}
              options={fiscalCountryOptions()}
              onChange={setCountry}
            />
          </Space>
        }
      />

      {entitiesQuery.error ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger les entités détentrices.')}
          actions={[{ label: t('Réessayer'), onClick: () => entitiesQuery.refetch(), primary: true }]}
        />
      ) : entitiesQuery.isPending ? (
        <SkeletonList rows={5} aria-label={t('Entités en cours de chargement')} />
      ) : (entitiesQuery.data ?? []).length === 0 ? (
        <StateBlock
          variant="empty"
          description={t('Aucune entité détentrice pour le moment.')}
          actions={[
            {
              label: t('Nouvelle entité'),
              primary: true,
              onClick: () => {
                setEditing(null);
                setModalOpen(true);
              }
            }
          ]}
        />
      ) : (
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          {(entitiesQuery.data ?? []).map(entity => (
            <Card
              key={entity.id}
              title={
                <span>
                  {entity.name} {!entity.isActive && <Tag>{t('Inactive')}</Tag>}
                </span>
              }
              extra={
                <Space>
                  <a onClick={() => navigate(`/tenant/${agence}/patrimoine/entities/${entity.id}`)}>{t('Voir')}</a>
                  <a
                    onClick={() => {
                      setEditing(entity);
                      setModalOpen(true);
                    }}
                  >
                    {t('Modifier')}
                  </a>
                  <ConfirmAction
                    title={t('Supprimer {{nom}} ?', { nom: entity.name })}
                    danger
                    onConfirm={() => handleDelete(entity)}
                  >
                    <a>{t('Supprimer')}</a>
                  </ConfirmAction>
                </Space>
              }
            >
              <Space orientation="vertical" size={4}>
                <Text>
                  {legalFormLabel(entity.legalForm)} — {fiscalCountryLabel(entity.country)}
                </Text>
                <Text type="secondary">
                  {t('{{count}} bien(s) rattaché(s)', { count: entity.propertiesCount })}
                  {entity.parentEntity && <> — {t('filiale de {{parent}}', { parent: entity.parentEntity.name })}</>}
                </Text>
              </Space>
            </Card>
          ))}
        </Space>
      )}

      <HoldingEntityFormModal
        open={modalOpen}
        tenantId={agence}
        entity={editing}
        entities={entitiesQuery.data ?? []}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
      />
    </>
  );
};
