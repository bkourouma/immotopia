import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Space, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { listAssets, type AssetClass, type AssetDto, type AssetStatus } from '../../services/patrimoine-assets-service';
import { useAuth } from '../../hooks/useAuth';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, SkeletonList, StateBlock, Table } from '../../components/primitives';
import { AssetFormDrawer, useLinkedPropertyIds } from '../../components/patrimoine/actifs/AssetFormDrawer';
import {
  assetClassLabel,
  assetClassOptions,
  assetStatusLabel,
  assetStatusOptions
} from '../../components/patrimoine/actifs/asset-classes';
import { formatAmount, formatDay } from '../../components/patrimoine/actifs/asset-format';
import { ReliabilityBadge, StaleTag } from '../../components/patrimoine/actifs/ReliabilityBadge';
import { AssetUsageBanner } from '../../components/patrimoine/AssetUsageBanner';
import { ASSET_USAGE_QUERY_KEY } from '../../services/personal-space-service';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { t } from '../../i18n/t';

const { Text } = Typography;

const STATUTS: readonly AssetStatus[] = ['ACTIVE', 'DISPOSED', 'ARCHIVED'];

// Plafond côté API (LIST_ASSETS_HARD_LIMIT), tri createdAt décroissant : au-delà, les plus anciens sont tronqués.
const PLAFOND_LISTE_API = 500;

// Accesseurs stables (hors composant) : le filtrage local reste mémoïsé.
// Champ libre : nom, bien lié, notes, et classe / statut tels qu'affichés.
const TEXTE_RECHERCHE = [
  (a: AssetDto) => a.name,
  (a: AssetDto) => a.property?.internalReference,
  (a: AssetDto) => a.property?.title,
  (a: AssetDto) => a.notes,
  (a: AssetDto) => assetClassLabel(a.assetClass),
  (a: AssetDto) => assetStatusLabel(a.status)
];
// Valeur courante en FCFA ; un actif sans valeur convertible sort dès qu'un intervalle est posé.
const valeurXof = (a: AssetDto): number | null =>
  a.currentValue?.valueXof ?? (a.currentValue?.currency === 'XOF' ? a.currentValue.amount : null);
const ACCESSEURS = {
  classe: (a: AssetDto) => a.assetClass,
  status: (a: AssetDto) => a.status,
  valeur: valeurXof,
  stale: (a: AssetDto) => a.stale
};

/**
 * Liste des actifs du patrimoine, avec recherche multicritères locale (la liste arrive en entier).
 * Le statut part encore à l'API : sans lui, le serveur exclut les actifs archivés.
 */
export const AssetsPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;

  const [drawerOpen, setDrawerOpen] = useState(false);

  // Le statut conditionne la requête (l'API exclut les archivés quand il est absent) : on le lit
  // dans l'URL avant d'avoir la liste, comme le fait le critère « Statut » de la barre.
  const [urlParams] = useSearchParams();
  const urlStatus = urlParams.get('status');
  const status = STATUTS.find(value => value === urlStatus);

  const assetsQuery = useQuery({
    queryKey: queryKey('patrimoine-assets', agence, { status }),
    queryFn: () => listAssets(agence as string, { status }),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });

  const items = useMemo(() => assetsQuery.data ?? [], [assetsQuery.data]);
  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Nom, bien lié, référence, notes…') },
    { key: 'classe', type: 'multiSelect', label: t('Classe'), primary: true, options: assetClassOptions() },
    { key: 'status', type: 'select', label: t('Statut'), primary: true, options: assetStatusOptions() },
    { key: 'valeur', type: 'numberRange', label: t('Valeur courante'), unit: 'FCFA' },
    {
      key: 'stale',
      type: 'boolean',
      label: t('Valeur à actualiser'),
      help: t('Actifs dont la dernière valorisation est trop ancienne.')
    }
  ];
  const local = useLocalListSearch<AssetDto>(items, {
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  const linkedPropertyIds = useLinkedPropertyIds(agence, drawerOpen);

  if (!agence) {
    return (
      <StateBlock
        variant="empty"
        title={t('Aucune agence sélectionnée')}
        description={t('Votre compte doit être rattaché à une agence pour consulter son patrimoine.')}
      />
    );
  }

  const openDrawer = () => setDrawerOpen(true);

  return (
    <>
      <PageHeader
        title={t('Mes actifs')}
        subtitle={t('Tout ce qui compose votre patrimoine, toutes classes confondues')}
        primaryAction={{ label: t('Ajouter un actif'), icon: <PlusOutlined />, onClick: openDrawer }}
      />

      <AssetUsageBanner tenantId={agence} />

      {items.length >= PLAFOND_LISTE_API ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 'var(--space-4)' }}
          title={t('Seuls les 500 actifs les plus récents sont affichés : affinez avec le statut.')}
        />
      ) : null}

      {assetsQuery.error ? (
        <StateBlock
          variant="error"
          actions={[{ label: t('Réessayer'), onClick: () => assetsQuery.refetch(), primary: true }]}
        />
      ) : assetsQuery.isPending ? (
        <SkeletonList rows={5} aria-label={t('Actifs en cours de chargement')} />
      ) : items.length === 0 && !local.isFiltered ? (
        <StateBlock
          variant="empty"
          title={t('Commencez par ajouter votre premier actif')}
          actions={[{ label: t('Ajouter un actif'), onClick: openDrawer, primary: true }]}
        />
      ) : (
        <Table<AssetDto>
          {...local.tableProps}
          aria-label={t('Mes actifs')}
          exportFilename={t('Mes actifs')}
          exportFetchAll={local.exportAll}
          rowKey="id"
          scroll={{ x: 'max-content' }}
          columns={[
            {
              title: t('Nom'),
              dataIndex: 'name',
              render: (name: string, asset) => (
                <Link to={`/tenant/${agence}/patrimoine/actifs/${asset.id}`}>{name}</Link>
              )
            },
            { title: t('Classe'), dataIndex: 'assetClass', render: (value: AssetClass) => assetClassLabel(value) },
            {
              title: t('Statut'),
              dataIndex: 'status',
              render: (value: AssetStatus) => <Tag>{assetStatusLabel(value)}</Tag>
            },
            {
              title: t('Valeur courante'),
              key: 'currentValue',
              align: 'end',
              exportValue: asset => asset.currentValue?.amount ?? null,
              render: (_: unknown, asset) =>
                asset.currentValue ? (
                  <Space size={8} wrap style={{ justifyContent: 'flex-end' }}>
                    <span>{formatAmount(asset.currentValue.amount, asset.currentValue.currency)}</span>
                    <ReliabilityBadge reliability={asset.currentValue.reliability} />
                    {asset.stale && <StaleTag status={asset.status} />}
                  </Space>
                ) : (
                  <Text type="secondary">{t('Sans valeur')}</Text>
                )
            },
            {
              title: t('Date de valorisation'),
              key: 'valuatedAt',
              render: (_: unknown, asset) =>
                asset.currentValue ? <span>{formatDay(asset.currentValue.valuatedAt)}</span> : '—'
            },
            {
              title: t('Dette restante'),
              dataIndex: 'outstandingDebtXof',
              align: 'end',
              render: (value: number) => (value > 0 ? formatAmount(value, 'XOF') : '—')
            }
          ]}
          onRow={asset => ({
            onDoubleClick: () => navigate(`/tenant/${agence}/patrimoine/actifs/${asset.id}`)
          })}
        />
      )}

      <AssetFormDrawer
        open={drawerOpen}
        tenantId={agence}
        linkedPropertyIds={linkedPropertyIds}
        onClose={() => setDrawerOpen(false)}
        onSaved={asset => {
          queryClient.invalidateQueries({ queryKey: ['patrimoine-assets'] });
          queryClient.invalidateQueries({ queryKey: ['patrimoine-net-worth'] });
          queryClient.invalidateQueries({ queryKey: [ASSET_USAGE_QUERY_KEY] });
          navigate(`/tenant/${agence}/patrimoine/actifs/${asset.id}`);
        }}
      />
    </>
  );
};
