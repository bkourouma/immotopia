import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Card, Pagination, Space, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createHoldingEntity,
  deleteHoldingEntity,
  listHoldingEntities,
  updateHoldingEntity
} from '../../../services/patrimoine-entities-service';
import type { CreateHoldingEntityInput, HoldingEntitySummary } from '../../../types/patrimoine-entities-types';
import { useAuth } from '../../../hooks/useAuth';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { ListSearch, PageHeader, StateBlock, SkeletonList, ConfirmAction } from '../../../components/primitives';
import { HoldingEntityFormModal } from '../../../components/patrimoine/entities/HoldingEntityFormModal';
import {
  fiscalCountryLabel,
  fiscalCountryOptions,
  legalFormLabel,
  legalFormOptions
} from '../../../components/patrimoine/entities/tax-labels';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { t } from '../../../i18n/t';
import { apiErrorMessage } from '../../../components/patrimoine/patrimoine-labels';

const { Text } = Typography;

const ENTITES_PAR_PAGE = 12;

// Accesseurs stables (hors composant) : le filtrage local reste mémoïsé.
// Champ libre : nom, immatriculation (RCCM), identifiant fiscal, société mère, contact,
// forme juridique et pays tels qu'affichés.
const TEXTE_RECHERCHE = [
  (e: HoldingEntitySummary) => e.name,
  (e: HoldingEntitySummary) => e.rccm,
  (e: HoldingEntitySummary) => e.taxId,
  (e: HoldingEntitySummary) => e.parentEntity?.name,
  (e: HoldingEntitySummary) => e.contact?.displayName,
  (e: HoldingEntitySummary) => legalFormLabel(e.legalForm),
  (e: HoldingEntitySummary) => fiscalCountryLabel(e.country)
];
const ACCESSEURS = {
  forme: (e: HoldingEntitySummary) => e.legalForm,
  pays: (e: HoldingEntitySummary) => e.country
};

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

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HoldingEntitySummary | null>(null);

  // L'API n'envoie pas les entités inactives par défaut : « Inclure les inactives » part à l'API
  // (lu dans l'URL avant d'avoir la liste, comme le critère de la barre). Le reste se filtre ici.
  const [urlParams] = useSearchParams();
  const includeInactive = urlParams.get('inactives') === '1';

  const entitiesQuery = useQuery({
    queryKey: queryKey('holding-entities', agence, { includeInactive }),
    queryFn: () => listHoldingEntities(agence as string, { includeInactive }),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });

  const entities = useMemo(() => entitiesQuery.data ?? [], [entitiesQuery.data]);
  // Parents possibles : les entités actives (comportement d'avant l'option « inactives »).
  const parentCandidates = useMemo(() => entities.filter(entity => entity.isActive), [entities]);
  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Nom, RCCM, identifiant fiscal, contact…') },
    { key: 'forme', type: 'multiSelect', label: t('Forme juridique'), primary: true, options: legalFormOptions() },
    { key: 'pays', type: 'multiSelect', label: t('Pays'), primary: true, options: fiscalCountryOptions() },
    {
      key: 'inactives',
      type: 'boolean',
      label: t('Inclure les inactives'),
      api: false,
      help: t('Affiche aussi les entités désactivées.')
    }
  ];
  const local = useLocalListSearch<HoldingEntitySummary>(entities, {
    ariaLabel: t('Rechercher dans les entités'),
    defaultPageSize: ENTITES_PAR_PAGE,
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
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
      />

      {entitiesQuery.error ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger les entités détentrices.')}
          actions={[{ label: t('Réessayer'), onClick: () => entitiesQuery.refetch(), primary: true }]}
        />
      ) : entitiesQuery.isPending ? (
        <SkeletonList rows={5} aria-label={t('Entités en cours de chargement')} />
      ) : entities.length === 0 && !local.isFiltered ? (
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
          <ListSearch {...local.searchProps} />
          {local.total === 0 ? (
            <StateBlock
              variant="no-results"
              actions={[{ label: t('Effacer les critères'), onClick: local.clear, primary: true }]}
            />
          ) : (
            local.pageItems.map(entity => (
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
            ))
          )}
          <Pagination
            current={local.page}
            pageSize={local.pageSize}
            total={local.total}
            showSizeChanger={false}
            hideOnSinglePage
            onChange={page => local.setPage(page)}
            aria-label={t('Pagination des entités')}
          />
        </Space>
      )}

      <HoldingEntityFormModal
        open={modalOpen}
        tenantId={agence}
        entity={editing}
        entities={parentCandidates}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
      />
    </>
  );
};
