import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Tabs, Tag } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAsset } from '../../services/patrimoine-assets-service';
import { useAuth } from '../../hooks/useAuth';
import { detailKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, SkeletonDetail, StateBlock } from '../../components/primitives';
import { AssetFormDrawer } from '../../components/patrimoine/actifs/AssetFormDrawer';
import { AssetHoldingsTab } from '../../components/patrimoine/actifs/AssetHoldingsTab';
import { AssetInfoTab } from '../../components/patrimoine/actifs/AssetInfoTab';
import { AssetValuationsTab } from '../../components/patrimoine/actifs/AssetValuationsTab';
import { DebtsPanel } from '../../components/patrimoine/actifs/DebtsPanel';
import { assetClassLabel, assetStatusLabel } from '../../components/patrimoine/actifs/asset-classes';
import { formatAmount, formatDay, isValuationStale } from '../../components/patrimoine/actifs/asset-format';
import { t } from '../../i18n/t';

/**
 * Fiche d'un actif : valeurs, dettes, détenteurs (actifs non immobiliers) et
 * informations. Dépenses, travaux et documents des actifs non immobiliers
 * viendront dans un lot ultérieur ; un bien immobilier les garde sur sa fiche.
 */
export const AssetDetailPage: React.FC = () => {
  const { tenantId, assetId } = useParams<{ tenantId: string; assetId: string }>();
  const queryClient = useQueryClient();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;
  const [editOpen, setEditOpen] = useState(false);

  const assetQuery = useQuery({
    queryKey: detailKey('patrimoine-asset', agence, assetId ?? ''),
    queryFn: () => getAsset(agence as string, assetId as string),
    enabled: Boolean(agence && assetId),
    staleTime: STALE_TIME.list
  });

  if (!agence || !assetId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }
  if (assetQuery.error) {
    return (
      <StateBlock
        variant="error"
        actions={[{ label: t('Réessayer'), onClick: () => assetQuery.refetch(), primary: true }]}
      />
    );
  }
  if (assetQuery.isPending || !assetQuery.data) {
    return <SkeletonDetail aria-label={t('Actif en cours de chargement')} />;
  }

  const asset = assetQuery.data;
  const isRealEstate = asset.assetClass === 'REAL_ESTATE';
  const current = asset.currentValue;

  const items = [
    { key: 'valuations', label: t('Valeurs'), children: <AssetValuationsTab tenantId={agence} asset={asset} /> },
    { key: 'debts', label: t('Dettes'), children: <DebtsPanel tenantId={agence} assetId={asset.id} /> },
    ...(isRealEstate
      ? []
      : [{ key: 'holdings', label: t('Détenteurs'), children: <AssetHoldingsTab tenantId={agence} asset={asset} /> }]),
    {
      key: 'info',
      label: t('Informations'),
      children: <AssetInfoTab tenantId={agence} asset={asset} onEdit={() => setEditOpen(true)} />
    }
  ];

  return (
    <>
      <PageHeader
        title={asset.name}
        subtitle={
          <span>
            {assetClassLabel(asset.assetClass)} <Tag>{assetStatusLabel(asset.status)}</Tag>
          </span>
        }
        breadcrumbs={[{ label: t('Mes actifs'), to: `/tenant/${agence}/patrimoine/actifs` }, { label: asset.name }]}
        extra={
          isRealEstate && asset.propertyId ? (
            <Link to={`/tenant/${agence}/properties/${asset.propertyId}`}>{t('Ouvrir la fiche du bien')}</Link>
          ) : undefined
        }
      />

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ color: 'var(--text-secondary)' }}>{t('Valeur courante')}</div>
        <strong style={{ fontSize: 'var(--font-size-h3)' }}>
          {current ? formatAmount(current.amount, current.currency) : t('Sans valeur')}
        </strong>
        {current && (
          <span style={{ marginInlineStart: 8 }}>{t('au {{date}}', { date: formatDay(current.valuatedAt) })}</span>
        )}
        {current && isValuationStale(current.valuatedAt) && (
          <Alert
            type="warning"
            showIcon
            banner
            style={{ marginTop: 'var(--space-2)' }}
            title={t('valeur de plus de 12 mois')}
          />
        )}
        {isRealEstate && (
          <p style={{ marginTop: 'var(--space-2)' }}>
            {t('Dépenses, travaux et documents se gèrent depuis la fiche du bien.')}
          </p>
        )}
      </div>

      <Tabs items={items} />

      <AssetFormDrawer
        open={editOpen}
        tenantId={agence}
        asset={asset}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['patrimoine-asset'] });
          queryClient.invalidateQueries({ queryKey: ['patrimoine-assets'] });
          queryClient.invalidateQueries({ queryKey: ['patrimoine-net-worth'] });
        }}
      />
    </>
  );
};
