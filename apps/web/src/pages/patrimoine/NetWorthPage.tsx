import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Col, Row } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNetWorth,
  getNetWorthHistory,
  listAssets,
  type AssetDto,
  type NetWorthResult
} from '../../services/patrimoine-assets-service';
import { useAuth } from '../../hooks/useAuth';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, SkeletonStats, StatCard, StateBlock } from '../../components/primitives';
import { AssetFormDrawer, useLinkedPropertyIds } from '../../components/patrimoine/actifs/AssetFormDrawer';
import { ClassBreakdownCard, NetWorthHistoryCard } from '../../components/patrimoine/actifs/NetWorthCharts';
import { DebtsPanel } from '../../components/patrimoine/actifs/DebtsPanel';
import { exclusionReasonLabel } from '../../components/patrimoine/actifs/asset-classes';
import { formatAmount, formatDay } from '../../components/patrimoine/actifs/asset-format';
import {
  anomalousExclusions,
  isNetWorthEmpty,
  monthsAgoIso
} from '../../components/patrimoine/actifs/net-worth-helpers';
import { t } from '../../i18n/t';

const HISTORY_MONTHS = 12;

/** Bandeau des actifs et prêts exclus du total, avec la raison et un lien vers la fiche. */
const ExclusionBanner: React.FC<{ tenantId: string; result: NetWorthResult; assets: AssetDto[] }> = ({
  tenantId,
  result,
  assets
}) => {
  const excluded = anomalousExclusions(result);
  if (excluded.length === 0 && result.excludedLoans.length === 0) return null;
  const nameOf = (id: string) => assets.find(asset => asset.id === id)?.name ?? t('Actif');
  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 'var(--space-4)' }}
      title={t('Certains éléments ne sont pas comptés dans ces totaux')}
      description={
        <ul style={{ margin: 0, paddingInlineStart: 20 }}>
          {excluded.map(item => (
            <li key={item.assetId}>
              <Link to={`/tenant/${tenantId}/patrimoine/actifs/${item.assetId}`}>{nameOf(item.assetId)}</Link>
              {' — '}
              {exclusionReasonLabel(item.reason)}
            </li>
          ))}
          {result.excludedLoans.map(item => (
            <li key={item.loanId}>
              {t('Un prêt est exclu du total des dettes')} {' — '}
              {exclusionReasonLabel(item.reason)}
            </li>
          ))}
        </ul>
      }
    />
  );
};

/**
 * Tableau de bord de la valeur nette : total des actifs, total des dettes,
 * valeur nette, répartition par classe, évolution et éléments exclus.
 */
export const NetWorthPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const netWorth = useQuery({
    queryKey: queryKey('patrimoine-net-worth', agence),
    queryFn: () => getNetWorth(agence as string),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });

  const from = useMemo(() => monthsAgoIso(HISTORY_MONTHS), []);
  const history = useQuery({
    queryKey: queryKey('patrimoine-net-worth-history', agence, { from }),
    queryFn: () => getNetWorthHistory(agence as string, { from, step: 'month' }),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });

  const hasExclusions = netWorth.data ? anomalousExclusions(netWorth.data).length > 0 : false;
  const assetsQuery = useQuery({
    queryKey: queryKey('patrimoine-assets', agence, {}),
    queryFn: () => listAssets(agence as string),
    enabled: Boolean(agence) && hasExclusions,
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
  const data = netWorth.data;
  const empty = data ? isNetWorthEmpty(data) : false;

  return (
    <>
      <PageHeader
        title={t('Valeur nette')}
        subtitle={t('Ce que vous possédez, ce que vous devez, et ce qui vous reste')}
        primaryAction={{ label: t('Ajouter un actif'), icon: <PlusOutlined />, onClick: openDrawer }}
      />

      {netWorth.error ? (
        <StateBlock
          variant="error"
          actions={[{ label: t('Réessayer'), onClick: () => netWorth.refetch(), primary: true }]}
        />
      ) : netWorth.isPending || !data ? (
        <SkeletonStats rows={3} aria-label={t('Valeur nette en cours de chargement')} />
      ) : empty ? (
        <StateBlock
          variant="empty"
          title={t('Commencez par ajouter votre premier actif')}
          description={t(
            'Immeuble, véhicule, épargne, compte mobile money… Ajoutez un actif et sa valeur pour voir apparaître votre valeur nette.'
          )}
          actions={[{ label: t('Ajouter un actif'), onClick: openDrawer, primary: true }]}
        />
      ) : (
        <>
          <ExclusionBanner tenantId={agence} result={data} assets={assetsQuery.data ?? []} />
          <Row gutter={[16, 16]} style={{ marginBottom: 'var(--space-4)' }}>
            <Col xs={24} md={8}>
              <StatCard label={t('Total des actifs')} value={formatAmount(data.totalAssets, data.currency)} />
            </Col>
            <Col xs={24} md={8}>
              <StatCard
                label={t('Total des dettes')}
                value={formatAmount(data.totalDebts, data.currency)}
                tone="warning"
              />
            </Col>
            <Col xs={24} md={8}>
              <StatCard
                highlight
                label={t('Valeur nette')}
                value={formatAmount(data.netWorth, data.currency)}
                tone={data.netWorth < 0 ? 'danger' : 'neutral'}
                hint={t('au {{date}}', { date: formatDay(data.asOf) })}
              />
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <ClassBreakdownCard result={data} />
            </Col>
            <Col xs={24} xl={12}>
              {history.error ? (
                <StateBlock
                  variant="error"
                  description={t("Impossible de charger l'évolution de la valeur nette.")}
                  actions={[{ label: t('Réessayer'), onClick: () => history.refetch(), primary: true }]}
                />
              ) : (
                <NetWorthHistoryCard points={history.data ?? []} />
              )}
            </Col>
          </Row>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <DebtsPanel tenantId={agence} />
          </div>
        </>
      )}

      <AssetFormDrawer
        open={drawerOpen}
        tenantId={agence}
        linkedPropertyIds={linkedPropertyIds}
        onClose={() => setDrawerOpen(false)}
        onSaved={asset => {
          queryClient.invalidateQueries({ queryKey: ['patrimoine-net-worth'] });
          queryClient.invalidateQueries({ queryKey: ['patrimoine-net-worth-history'] });
          queryClient.invalidateQueries({ queryKey: ['patrimoine-assets'] });
          navigate(`/tenant/${agence}/patrimoine/actifs/${asset.id}`);
        }}
      />
    </>
  );
};
