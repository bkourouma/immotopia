import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Tabs, Tag } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAsset, listAssetValuations, type AssetDto } from '../../services/patrimoine-assets-service';
import { useAuth } from '../../hooks/useAuth';
import { detailKey, queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, SkeletonDetail, StateBlock } from '../../components/primitives';
import { AssetFormDrawer } from '../../components/patrimoine/actifs/AssetFormDrawer';
import { AssetHoldingsTab } from '../../components/patrimoine/actifs/AssetHoldingsTab';
import { AssetInfoTab } from '../../components/patrimoine/actifs/AssetInfoTab';
import { AssetValuationsTab } from '../../components/patrimoine/actifs/AssetValuationsTab';
import { DebtsPanel } from '../../components/patrimoine/actifs/DebtsPanel';
import {
  assetClassLabel,
  assetStatusLabel,
  FRAGILE_LEGAL_STATUSES
} from '../../components/patrimoine/actifs/asset-classes';
import { formatAmount, formatDay } from '../../components/patrimoine/actifs/asset-format';
import { ReliabilityBadge, StaleTag } from '../../components/patrimoine/actifs/ReliabilityBadge';
import { t } from '../../i18n/t';

/** Rappel pour un bien immobilier dont le statut juridique plafonne ou empêche de fiabiliser la valeur. */
function legalStatusHint(asset: AssetDto): string | null {
  if (asset.assetClass !== 'REAL_ESTATE' || asset.status !== 'ACTIVE') return null;
  const status = asset.details?.legalStatus;
  if (typeof status !== 'string' || status === '') {
    return t('Renseignez le statut juridique du bien pour fiabiliser sa valeur.');
  }
  return FRAGILE_LEGAL_STATUSES.includes(status)
    ? t('Statut juridique fragile : la fiabilité de la valeur est plafonnée.')
    : null;
}

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

  // Même clé que l'onglet Valeurs : une seule requête, dont on tire les raisons de la valeur courante.
  const valuationsQuery = useQuery({
    queryKey: queryKey('patrimoine-asset-valuations', agence, { assetId }),
    queryFn: () => listAssetValuations(agence as string, assetId as string),
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
  const currentReasons = current
    ? (valuationsQuery.data ?? []).find(
        v => v.valuatedAt.slice(0, 10) === current.valuatedAt.slice(0, 10) && v.estimatedValue === current.amount
      )?.reliabilityReasons
    : undefined;
  const legalHint = legalStatusHint(asset);

  const items = [
    {
      key: 'valuations',
      label: t('Valeurs'),
      children: <AssetValuationsTab tenantId={agence} asset={asset} onCompleteInfo={() => setEditOpen(true)} />
    },
    { key: 'debts', label: t('Dettes'), children: <DebtsPanel tenantId={agence} assetId={asset.id} /> },
    ...(isRealEstate
      ? []
      : [
          {
            key: 'holdings',
            label: t('Détenteurs'),
            children: <AssetHoldingsTab tenantId={agence} asset={asset} />
          }
        ]),
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
        {current && (
          <span style={{ marginInlineStart: 8, display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            <ReliabilityBadge reliability={current.reliability} reasons={currentReasons} />
            {asset.stale && <StaleTag status={asset.status} />}
          </span>
        )}
        {isRealEstate && (
          <p style={{ marginTop: 'var(--space-2)' }}>
            {t('Dépenses, travaux et documents se gèrent depuis la fiche du bien.')}
          </p>
        )}
      </div>

      {legalHint && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 'var(--space-4)' }}
          title={legalHint}
          action={
            <Button size="small" onClick={() => setEditOpen(true)}>
              {t("Modifier l'actif")}
            </Button>
          }
        />
      )}

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
