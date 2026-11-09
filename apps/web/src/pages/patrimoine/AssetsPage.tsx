import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Space, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listAssetsPage,
  type AssetClass,
  type AssetDto,
  type AssetStatus
} from '../../services/patrimoine-assets-service';
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
import { useListSearch } from '../../hooks/useListSearch';
import type { ApiParams, SearchCriterion } from '../../utils/list-search';
import { t } from '../../i18n/t';
import { collectAllPages } from '../../utils/table-export/collect';

const { Text } = Typography;

/**
 * Liste des actifs du patrimoine, filtree et paginee par le serveur.
 * Le statut part encore à l'API : sans lui, le serveur exclut les actifs archivés.
 */
export const AssetsPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;

  const [drawerOpen, setDrawerOpen] = useState(false);

  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Nom, bien lié, référence, notes…'),
      api: 'search'
    },
    {
      key: 'classe',
      type: 'multiSelect',
      label: t('Classe'),
      primary: true,
      options: assetClassOptions(),
      api: 'assetClasses'
    },
    { key: 'status', type: 'select', label: t('Statut'), primary: true, options: assetStatusOptions() },
    { key: 'valeur', type: 'numberRange', label: t('Valeur courante'), unit: 'FCFA', api: ['minValue', 'maxValue'] },
    {
      key: 'stale',
      type: 'boolean',
      label: t('Valeur à actualiser'),
      help: t('Actifs dont la dernière valorisation est trop ancienne.'),
      api: (value): ApiParams => (value === true ? { stale: 'true' } : value === false ? { stale: 'false' } : {})
    }
  ];
  const search = useListSearch({ criteria, defaultPageSize: 25, apiNames: { sort: false } });
  const assetsQuery = useQuery({
    queryKey: queryKey('patrimoine-assets', agence, search.apiParams),
    queryFn: () =>
      listAssetsPage(agence as string, {
        ...search.apiParams,
        page: search.page,
        limit: Math.min(search.pageSize, 100)
      }),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });
  const items = assetsQuery.data?.items ?? [];
  const total = assetsQuery.data?.total ?? 0;

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

      {assetsQuery.error ? (
        <StateBlock
          variant="error"
          actions={[{ label: t('Réessayer'), onClick: () => assetsQuery.refetch(), primary: true }]}
        />
      ) : assetsQuery.isPending ? (
        <SkeletonList rows={5} aria-label={t('Actifs en cours de chargement')} />
      ) : total === 0 && !search.isFiltered ? (
        <StateBlock
          variant="empty"
          title={t('Commencez par ajouter votre premier actif')}
          actions={[{ label: t('Ajouter un actif'), onClick: openDrawer, primary: true }]}
        />
      ) : (
        <Table<AssetDto>
          dataSource={items}
          search={search.searchProps}
          pagination={search.tablePagination(total)}
          aria-label={t('Mes actifs')}
          exportFilename={t('Mes actifs')}
          exportFetchAll={() =>
            collectAllPages((page, limit) => listAssetsPage(agence, { ...search.filterParams, page, limit }))
          }
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
