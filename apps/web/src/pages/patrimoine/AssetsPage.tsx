import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Input, Select, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listAssets, type AssetClass, type AssetDto, type AssetStatus } from '../../services/patrimoine-assets-service';
import { useAuth } from '../../hooks/useAuth';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, SkeletonList, StateBlock } from '../../components/primitives';
import { AssetFormDrawer, useLinkedPropertyIds } from '../../components/patrimoine/actifs/AssetFormDrawer';
import {
  assetClassLabel,
  assetClassOptions,
  assetStatusLabel,
  assetStatusOptions
} from '../../components/patrimoine/actifs/asset-classes';
import { formatAmount, formatDay } from '../../components/patrimoine/actifs/asset-format';
import { ReliabilityBadge, StaleTag } from '../../components/patrimoine/actifs/ReliabilityBadge';
import { t } from '../../i18n/t';

const { Text } = Typography;

/** Liste des actifs du patrimoine, filtrable par classe, statut et recherche. */
export const AssetsPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;

  const [assetClass, setAssetClass] = useState<AssetClass | undefined>();
  const [status, setStatus] = useState<AssetStatus | undefined>();
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filters = { assetClass, status, search: search.trim() || undefined };
  const filtered = Boolean(assetClass || status || filters.search);

  const assetsQuery = useQuery({
    queryKey: queryKey('patrimoine-assets', agence, filters),
    queryFn: () => listAssets(agence as string, filters),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
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
  const rows = assetsQuery.data ?? [];

  return (
    <>
      <PageHeader
        title={t('Mes actifs')}
        subtitle={t('Tout ce qui compose votre patrimoine, toutes classes confondues')}
        primaryAction={{ label: t('Ajouter un actif'), icon: <PlusOutlined />, onClick: openDrawer }}
        extra={
          <Space wrap>
            <Select
              allowClear
              placeholder={t('Classe')}
              aria-label={t('Filtrer par classe')}
              style={{ width: 240 }}
              value={assetClass}
              options={assetClassOptions()}
              onChange={value => setAssetClass(value)}
            />
            <Select
              allowClear
              placeholder={t('Statut')}
              aria-label={t('Filtrer par statut')}
              style={{ width: 140 }}
              value={status}
              options={assetStatusOptions()}
              onChange={value => setStatus(value)}
            />
            <Input.Search
              allowClear
              placeholder={t('Rechercher un actif')}
              aria-label={t('Rechercher un actif')}
              style={{ width: 220 }}
              onSearch={value => setSearch(value)}
            />
          </Space>
        }
      />

      {assetsQuery.error ? (
        <StateBlock
          variant="error"
          actions={[{ label: t('Réessayer'), onClick: () => assetsQuery.refetch(), primary: true }]}
        />
      ) : assetsQuery.isPending ? (
        <SkeletonList rows={5} aria-label={t('Actifs en cours de chargement')} />
      ) : rows.length === 0 ? (
        filtered ? (
          <StateBlock variant="no-results" description={t('Aucun actif ne correspond à ces filtres.')} />
        ) : (
          <StateBlock
            variant="empty"
            title={t('Commencez par ajouter votre premier actif')}
            actions={[{ label: t('Ajouter un actif'), onClick: openDrawer, primary: true }]}
          />
        )
      ) : (
        <Table<AssetDto>
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
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
              render: (_: unknown, asset) =>
                asset.currentValue ? (
                  <Space size={8} wrap style={{ justifyContent: 'flex-end' }}>
                    <span>{formatAmount(asset.currentValue.amount, asset.currentValue.currency)}</span>
                    <ReliabilityBadge reliability={asset.currentValue.reliability} />
                    {asset.stale && <StaleTag />}
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
          navigate(`/tenant/${agence}/patrimoine/actifs/${asset.id}`);
        }}
      />
    </>
  );
};
