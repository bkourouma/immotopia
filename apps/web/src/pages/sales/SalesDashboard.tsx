import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { getSalesPipeline, listSaleMandates } from '../../services/sales-service';
import type { SaleMandateDto } from '../../services/sales-service';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, DataView, DataCard, StatCard } from '../../components/primitives';
import { MANDATE_TYPE_LABELS, dateCourte } from './helpers';
import { t } from '../../i18n/t';
import { SaleStatusTag } from './SaleStatusTag';

/**
 * Tableau des ventes — lot 9 (PRD §5.1).
 *
 * Les compteurs de `/pipeline`, puis la liste des mandats actifs : bien,
 * vendeur, prix demandé, type, échéance, nombre d'offres, statut. Construit
 * sur le modèle de `pages/finance/ComptesProprietaires.tsx`.
 */
export const SalesDashboard: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const {
    data: pipeline,
    isPending: pipelineLoading,
    error: pipelineError,
    refetch: refetchPipeline
  } = useQuery({
    queryKey: queryKey('sales-pipeline', tenantId),
    queryFn: () => getSalesPipeline(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const {
    data: mandates,
    isPending: mandatesLoading,
    isFetching: mandatesFetching,
    error: mandatesError,
    refetch: refetchMandates
  } = useQuery({
    queryKey: queryKey('sale-mandates', tenantId, { status: 'ACTIVE' }),
    queryFn: () => listSaleMandates(tenantId as string, { status: 'ACTIVE' }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const items = mandates ?? [];
  const ouvrirMandat = (mandate: SaleMandateDto) => navigate(`/tenant/${tenantId}/sales/mandates/${mandate.id}`);

  const colonnes: ColumnsType<SaleMandateDto> = [
    {
      title: t('Numéro'),
      key: 'numero',
      render: (_, m) => <Link to={`/tenant/${tenantId}/sales/mandates/${m.id}`}>{m.number}</Link>
    },
    { title: t('Bien'), key: 'bien', render: (_, m) => m.propertyLabel },
    { title: t('Vendeur'), key: 'vendeur', render: (_, m) => m.sellerName },
    {
      title: t('Prix demandé'),
      key: 'prix',
      align: 'end',
      render: (_, m) => <MoneyValue value={m.askingPrice} />
    },
    { title: t('Type'), key: 'type', render: (_, m) => MANDATE_TYPE_LABELS[m.mandateType] },
    { title: t('Échéance'), key: 'echeance', render: (_, m) => dateCourte(m.endDate) },
    { title: t('Offres'), key: 'offres', align: 'end', render: (_, m) => m.offersCount },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, m) => (
        <SaleStatusTag kind="mandate" status={m.isExpired && m.status === 'ACTIVE' ? 'EXPIRED' : m.status} />
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Ventes')}
        primaryAction={{
          label: t('Nouveau mandat'),
          onClick: () => navigate(`/tenant/${tenantId}/sales/mandates?new=1`)
        }}
        secondaryActions={[
          {
            key: 'mandates',
            label: t('Tous les mandats'),
            onClick: () => navigate(`/tenant/${tenantId}/sales/mandates`)
          },
          {
            key: 'commissions',
            label: t('Commissions de vente'),
            onClick: () => navigate(`/tenant/${tenantId}/sales/commissions`)
          }
        ]}
      />

      {pipelineError ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger les indicateurs des ventes.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetchPipeline(), primary: true }]}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-6)'
          }}
        >
          <StatCard
            label={t('Mandats actifs')}
            value={pipelineLoading ? '—' : (pipeline?.activeMandates ?? 0)}
            hint={pipeline ? <MoneyValue value={pipeline.activeMandatesValue} /> : undefined}
          />
          <StatCard
            label={t('Mandats expirés')}
            value={pipelineLoading ? '—' : (pipeline?.expiredMandates ?? 0)}
            tone="warning"
          />
          <StatCard label={t('Offres ouvertes')} value={pipelineLoading ? '—' : (pipeline?.openOffers ?? 0)} />
          <StatCard
            label={t('Compromis signés')}
            value={pipelineLoading ? '—' : (pipeline?.signedAgreements ?? 0)}
            hint={pipeline ? <MoneyValue value={pipeline.signedAgreementsValue} /> : undefined}
          />
          <StatCard
            label={t('Ventes ce mois-ci')}
            value={pipelineLoading ? '—' : (pipeline?.salesThisMonth ?? 0)}
            hint={pipeline ? <MoneyValue value={pipeline.salesThisMonthValue} /> : undefined}
            tone="positive"
          />
          <StatCard
            label={t('Commissions dues')}
            value={pipelineLoading ? '—' : <MoneyValue value={pipeline?.commissionsDue ?? 0} />}
            tone="warning"
          />
          <StatCard
            label={t('Commissions encaissées ce mois-ci')}
            value={pipelineLoading ? '—' : <MoneyValue value={pipeline?.commissionsCollectedThisMonth ?? 0} />}
            tone="positive"
          />
        </div>
      )}

      <DataView<SaleMandateDto>
        paginated={false}
        items={items}
        total={items.length}
        page={1}
        pageSize={Math.max(items.length, 1)}
        onPageChange={() => {}}
        loading={mandatesLoading}
        isReloading={mandatesFetching && !mandatesLoading}
        error={mandatesError ? t('Impossible de charger les mandats actifs.') : null}
        onRetry={() => refetchMandates()}
        emptyDescription={t('Aucun mandat de vente actif.')}
        columns={colonnes}
        rowKey={m => m.id}
        aria-label={t('Mandats de vente actifs')}
        renderCard={m => (
          <DataCard
            title={m.propertyLabel}
            subtitle={`${m.number} · ${m.sellerName}`}
            highlight={<MoneyValue value={m.askingPrice} />}
            fields={[
              { label: t('Type'), value: MANDATE_TYPE_LABELS[m.mandateType] },
              { label: t('Échéance'), value: dateCourte(m.endDate) },
              { label: t('Offres'), value: String(m.offersCount) }
            ]}
            onOpen={() => ouvrirMandat(m)}
          />
        )}
      />
    </>
  );
};

export default SalesDashboard;
