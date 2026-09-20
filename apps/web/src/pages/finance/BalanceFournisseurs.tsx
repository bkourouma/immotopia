import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, DatePicker, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { getSuppliersBalance, listConstructionSites } from '../../services/finance-lot2-service';
import type { SuppliersBalanceLine } from '../../types/finance-lot2-types';
import { useListParams } from '../../hooks/useListParams';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  MoneyValue,
  DataView,
  DataCard,
  FilterSheet,
  StatCard
} from '../../components/primitives';
import { t } from '../../i18n/t';

/**
 * Balance fournisseurs — récit 5 du lot 2
 * (`specs/017-finance-fournisseurs-chantiers/spec.md`), miroir exact de
 * `BalanceClients.tsx` (lot 1) : une ligne par fournisseur, ce que l'agence
 * lui doit, filtrable par période et par chantier, un total de contrôle en
 * pied de liste. Même modèle, mêmes primitives, mêmes trois états délégués à
 * `<DataView>`.
 *
 * **Aucune pagination.** Comme sa jumelle clients, `SuppliersBalance` n'est
 * pas paginée par l'API : `paginated={false}` le dit explicitement.
 *
 * **Vocabulaire (P-1 du PRD, étendu par FR-028).** Les colonnes disent
 * « Facturé » et « Réglé » — jamais « débit » ni « crédit ». Un test dédié
 * (`__tests__/finance/fournisseurs.test.tsx`) échoue si l'un de ces deux mots
 * s'y glisse.
 *
 * **Montants.** Toujours par `<MoneyValue>`, sans préciser `currency` : la
 * devise stockée (`XOF`) s'affiche « FCFA » par le défaut du composant.
 *
 * Les options du filtre « Chantier » viennent de `listConstructionSites`, pas
 * de la balance elle-même : la balance ne porte que des libellés, l'API de
 * filtrage attend un identifiant.
 */

type Filters = { from: string; to: string; siteId: string };
const FILTER_KEYS = ['from', 'to', 'siteId'] as const;

const { RangePicker } = DatePicker;

export const BalanceFournisseurs: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const list = useListParams<Filters>({ filterKeys: FILTER_KEYS });

  const filtresApi = {
    from: list.filters.from || undefined,
    to: list.filters.to || undefined,
    siteId: list.filters.siteId || undefined
  };

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('suppliers-balance', tenantId, filtresApi),
    queryFn: () => getSuppliersBalance(tenantId as string, filtresApi),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const { data: chantiers } = useQuery({
    queryKey: queryKey('finance-chantiers-reference', tenantId, {}),
    queryFn: () => listConstructionSites(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const optionsChantiers = React.useMemo(
    () =>
      (chantiers ?? [])
        .map(chantier => ({ value: chantier.id, label: chantier.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [chantiers]
  );

  const lignes = data?.lines ?? [];

  const ouvrirReleve = (ligne: SuppliersBalanceLine) =>
    navigate(`/tenant/${tenantId}/finance/comptes/${ligne.accountId}`);

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const colonnes: ColumnsType<SuppliersBalanceLine> = [
    { title: t('Fournisseur'), key: 'fournisseur', render: (_, l) => l.label },
    {
      title: t('Facturé'),
      key: 'facture',
      align: 'end',
      render: (_, l) => <MoneyValue value={l.totalBilled} />
    },
    {
      title: t('Réglé'),
      key: 'regle',
      align: 'end',
      render: (_, l) => <MoneyValue value={l.totalSettled} />
    },
    {
      title: t('Solde'),
      key: 'solde',
      align: 'end',
      render: (_, l) => <MoneyValue value={l.balance} signed />
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, l) => (
        <Button type="link" onClick={() => ouvrirReleve(l)}>
          {t('Voir le relevé')}
        </Button>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Balance fournisseurs')}
        subtitle={lignes.length > 0 ? `${lignes.length} fournisseur${lignes.length > 1 ? 's' : ''}` : undefined}
      />

      <FilterSheet
        activeCount={Object.keys(list.filters).length}
        onClear={list.clearFilters}
        title={t('Filtrer la balance')}
      >
        <div style={{ minWidth: 260 }}>
          <label htmlFor="filtre-periode-balance-fournisseurs">{t('Période')}</label>
          <RangePicker
            id="filtre-periode-balance-fournisseurs"
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            value={[
              list.filters.from ? dayjs(list.filters.from) : null,
              list.filters.to ? dayjs(list.filters.to) : null
            ]}
            onChange={dates =>
              list.setFilters({
                from: dates?.[0] ? dates[0].format('YYYY-MM-DD') : undefined,
                to: dates?.[1] ? dates[1].format('YYYY-MM-DD') : undefined
              })
            }
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="filtre-chantier-balance-fournisseurs">{t('Chantier')}</label>
          <Select
            id="filtre-chantier-balance-fournisseurs"
            style={{ width: '100%' }}
            placeholder={t('Tous les chantiers')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={list.filters.siteId || undefined}
            onChange={value => list.setFilters({ siteId: value })}
            options={optionsChantiers}
          />
        </div>
      </FilterSheet>

      <DataView<SuppliersBalanceLine>
        paginated={false}
        items={lignes}
        total={lignes.length}
        page={1}
        pageSize={Math.max(lignes.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger la balance fournisseurs.') : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={list.clearFilters}
        emptyDescription={t('Aucun fournisseur enregistré.')}
        columns={colonnes}
        rowKey={l => l.accountId}
        aria-label={t('Balance fournisseurs')}
        renderCard={l => (
          <DataCard
            title={l.label}
            aria-label={l.label}
            highlight={<MoneyValue value={l.balance} signed />}
            fields={[
              { label: t('Facturé'), value: <MoneyValue value={l.totalBilled} /> },
              { label: t('Réglé'), value: <MoneyValue value={l.totalSettled} /> }
            ]}
            onOpen={() => ouvrirReleve(l)}
          />
        )}
      />

      {/* Total de contrôle, en pied de liste : la somme des soldes affichés. */}
      {data && lignes.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)', maxWidth: 320 }}>
          <StatCard label={t('Total de contrôle')} value={<MoneyValue value={data.totalBalance} signed />} />
        </div>
      )}
    </>
  );
};
