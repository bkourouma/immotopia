import React from 'react';
import { useParams } from 'react-router-dom';
import { Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { listTenantWorkPrograms, WorkProgramAvecBien } from '../../../services/patrimoine-service';
import { useAuth } from '../../../hooks/useAuth';
import { useListParams } from '../../../hooks/useListParams';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { PageHeader, StateBlock, StatusTag, DataView, DataCard, FilterSheet } from '../../../components/primitives';
import { t } from '../../../i18n/t';

import { activeLocale } from '../../../i18n/format';
/**
 * Programmes de travaux — le même N+1, doublé d'un filtrage en mémoire (§8.4).
 *
 * L'écran chargeait jusqu'à 100 biens, lançait une requête de travaux par bien,
 * **puis filtrait par statut dans le navigateur** (`:48`). Deux défauts qui se
 * renforcent : on téléchargeait tout pour n'en montrer qu'une partie, et le
 * coût du filtre était payé au chargement plutôt qu'au serveur.
 *
 * Une requête désormais, filtrée et paginée côté serveur. Le statut vit dans
 * l'URL : une liste des travaux en retard se partage par copier-coller.
 */

type Filtres = { status: string };
const FILTER_KEYS = ['status'] as const;

const STATUTS = [
  { value: 'PLANNED', label: t('Planifié') },
  { value: 'IN_PROGRESS', label: t('En cours') },
  { value: 'COMPLETED', label: t('Terminé') },
  { value: 'CANCELLED', label: t('Annulé') }
];

function dateCourte(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(activeLocale());
}

export const WorkProgramsPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;

  const list = useListParams<Filtres>({ filterKeys: FILTER_KEYS, defaultPageSize: 25 });

  const {
    data,
    isPending,
    isFetching,
    error: erreur,
    refetch
  } = useQuery({
    queryKey: queryKey('work-programs', agence, list.queryParams),
    queryFn: () =>
      listTenantWorkPrograms(agence as string, {
        status: list.filters.status || undefined,
        page: list.page,
        limit: list.pageSize
      }),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });

  if (!agence) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const programmes = data?.items ?? [];
  const total = data?.total ?? 0;

  const colonnes: ColumnsType<WorkProgramAvecBien> = [
    {
      title: t('Bien'),
      key: 'bien',
      render: (_, programme) => (
        <>
          <div style={{ fontWeight: 600 }}>{programme.property?.title || '—'}</div>
          {programme.property?.internalReference && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              {programme.property.internalReference}
            </div>
          )}
        </>
      )
    },
    { title: t('Programme'), dataIndex: 'title', key: 'titre' },
    {
      title: t('Prévu le'),
      key: 'date',
      render: (_, programme) => dateCourte((programme as { plannedDate?: string }).plannedDate)
    },
    { title: t('Statut'), key: 'statut', render: (_, programme) => <StatusTag status={programme.status} /> }
  ];

  return (
    <>
      <PageHeader
        title={t('Programmes de travaux')}
        subtitle={total > 0 ? `${total} programme${total > 1 ? 's' : ''}` : t('Planification et suivi des travaux')}
      />

      <FilterSheet
        activeCount={list.filters.status ? 1 : 0}
        onClear={list.clearFilters}
        title={t('Filtrer les programmes')}
      >
        <div style={{ minWidth: 220 }}>
          <label htmlFor="filtre-statut-travaux">{t('Statut')}</label>
          <Select
            showSearch
            optionFilterProp="label"
            id="filtre-statut-travaux"
            style={{ width: '100%' }}
            placeholder={t('Tous les statuts')}
            allowClear
            value={list.filters.status || undefined}
            onChange={valeur => list.setFilters({ status: valeur })}
            options={STATUTS}
          />
        </div>
      </FilterSheet>

      <DataView<WorkProgramAvecBien>
        items={programmes}
        total={total}
        page={list.page}
        pageSize={list.pageSize}
        onPageChange={(page, taille) => (taille !== list.pageSize ? list.setPageSize(taille) : list.setPage(page))}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreur ? t('Impossible de charger les programmes de travaux.') : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={list.clearFilters}
        emptyDescription={t("Aucun programme de travaux n'est enregistré pour cette agence.")}
        columns={colonnes}
        rowKey={programme => programme.id}
        aria-label={t('Programmes de travaux')}
        renderCard={programme => (
          <DataCard
            title={programme.title}
            aria-label={`${programme.title}, ${programme.property?.title ?? 'bien inconnu'}`}
            subtitle={programme.property?.title || t('Bien inconnu')}
            status={<StatusTag status={programme.status} />}
            fields={[
              { label: t('Prévu le'), value: dateCourte((programme as { plannedDate?: string }).plannedDate) },
              ...(programme.property?.internalReference
                ? [{ label: t('Référence'), value: programme.property.internalReference }]
                : [])
            ]}
          />
        )}
      />
    </>
  );
};
