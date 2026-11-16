import React from 'react';
import { useParams } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listTenantWorkPrograms, WorkProgramAvecBien } from '../../../services/patrimoine-service';
import { getProperty, listProperties } from '../../../services/property-service';
import { useAuth } from '../../../hooks/useAuth';
import { useListSearch } from '../../../hooks/useListSearch';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { PageHeader, StateBlock, StatusTag, DataView, DataCard } from '../../../components/primitives';
import type { NumberRangeValue } from '../../../utils/list-search';
import { collectAllPages } from '../../../utils/table-export/collect';
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
 * Une requête désormais, filtrée et paginée côté serveur. Les critères (texte,
 * statut, bien, date prévue, coût estimé) vivent dans l'URL : une liste des
 * travaux se partage par copier-coller.
 */

// Une fonction, et non une constante de module : `t()` doit se lire au rendu,
// dans la langue affichée, et non une fois pour toutes au chargement du module.
function statuts(): Array<{ value: string; label: string }> {
  return [
    { value: 'PLANNED', label: t('Planifié') },
    { value: 'IN_PROGRESS', label: t('En cours') },
    { value: 'COMPLETED', label: t('Terminé') },
    { value: 'CANCELLED', label: t('Annulé') }
  ];
}

function sousTitre(total: number): string {
  if (total <= 0) return t('Planification et suivi des travaux');
  return total > 1 ? t('{{total}} programmes', { total }) : t('{{total}} programme', { total });
}

function dateCourte(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(activeLocale());
}

export const WorkProgramsPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;

  const libelleBien = (bien: { internalReference: string; title: string }) =>
    `${bien.internalReference} · ${bien.title}`;

  const search = useListSearch({
    defaultPageSize: 25,
    apiNames: { sort: false },
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Programme, bien, référence…') },
      { key: 'status', type: 'multiSelect', label: t('Statut'), primary: true, options: statuts() },
      {
        key: 'propertyId',
        type: 'select',
        label: t('Bien'),
        primary: true,
        loadOptions: async terme => {
          const { properties } = await listProperties(agence as string, { q: terme || undefined, limit: 20 });
          return properties.map(bien => ({ value: bien.id, label: libelleBien(bien) }));
        },
        resolveLabel: async id => libelleBien(await getProperty(agence as string, id))
      },
      { key: 'planned', type: 'dateRange', label: t('Date prévue'), api: ['plannedFrom', 'plannedTo'] },
      {
        key: 'cost',
        type: 'numberRange',
        label: t('Coût estimé'),
        unit: 'FCFA',
        // Un coût estimé n'est jamais négatif (l'API répond 400) : une borne négative n'est pas envoyée.
        api: value => {
          const { min, max } = value as NumberRangeValue;
          return {
            ...(min !== undefined && min >= 0 ? { minCost: min } : {}),
            ...(max !== undefined && max >= 0 ? { maxCost: max } : {})
          };
        }
      }
    ]
  });

  const {
    data,
    isPending,
    isFetching,
    error: erreur,
    refetch
  } = useQuery({
    queryKey: queryKey('work-programs', agence, search.apiParams),
    // L'API refuse une taille de page > 100 : un lien modifié à la main ne doit pas casser l'écran.
    queryFn: () =>
      listTenantWorkPrograms(agence as string, {
        ...search.apiParams,
        limit: Math.min(Number(search.apiParams.limit) || 25, 100)
      }),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
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
      exportValue: programme =>
        programme.property?.internalReference
          ? `${programme.property.title || '—'} — ${programme.property.internalReference}`
          : programme.property?.title || '—',
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
      <PageHeader title={t('Programmes de travaux')} subtitle={sousTitre(total)} />

      <DataView<WorkProgramAvecBien>
        helpId="patrimoine.travaux.tableau"
        // Export de TOUS les programmes, avec les mêmes critères que la liste affichée.
        export={{
          filename: t('Programmes de travaux'),
          fetchAll: () =>
            collectAllPages<WorkProgramAvecBien>(async (page, limit) => {
              const reponse = await listTenantWorkPrograms(agence, { ...search.filterParams, page, limit });
              return { items: reponse.items ?? [], total: reponse.total ?? 0 };
            })
        }}
        items={programmes}
        total={total}
        search={search.searchProps}
        {...search.dataViewProps}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreur ? t('Impossible de charger les programmes de travaux.') : null}
        errorCause={erreur}
        onRetry={() => refetch()}
        emptyDescription={t("Aucun programme de travaux n'est enregistré pour cette agence.")}
        columns={colonnes}
        rowKey={programme => programme.id}
        aria-label={t('Programmes de travaux')}
        renderCard={programme => (
          <DataCard
            title={programme.title}
            aria-label={`${programme.title}, ${programme.property?.title ?? t('Bien inconnu')}`}
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
