import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Checkbox, Select, Space, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { acknowledgeBudgetAlert, getSitesDashboard } from '../../services/finance-lot3-service';
import type { SiteDashboardRow } from '../../types/finance-lot3-types';
import { SITE_STATUS_LABELS } from '../../types/finance-lot2-types';
import { useListParams } from '../../hooks/useListParams';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  MoneyValue,
  DataView,
  DataCard,
  FilterSheet,
  StatusTag
} from '../../components/primitives';
import type { StatusTone } from '../../components/primitives';
import { t } from '../../i18n/t';

/**
 * Tableau de bord des chantiers — écran de pilotage du lot 3
 * (specs/018-finance-budget-pilotage/data-model.md §4, §5,
 * `GET /tenants/{tenantId}/finance/sites/dashboard`).
 *
 * Un seul appel, agrégé côté serveur (critère de sortie 4 du modèle) : cet
 * écran n'agrège rien lui-même, il rend `SitesDashboard.rows` telles quelles.
 *
 * **Aucun total n'est recalculé ici.** `initialBudget`, `revisedBudget`,
 * `engagedAmount`, `actualCost`, `variance`, `variancePercent` arrivent tous
 * déjà calculés — en particulier `revisedBudget` et `variance`, qui n'ont pas
 * d'équivalent recomposable côté écran (`variance` se calcule contre le
 * budget **révisé**, une grandeur que ce lot ne stocke jamais, §2 du modèle).
 *
 * **Le code couleur demandé porte sur deux choses distinctes, toutes deux
 * tirées de données déjà calculées, jamais d'un nouveau calcul :**
 * - l'écart (`variance`) : `<MoneyValue signed>` le colore déjà en rouge s'il
 *   est négatif ; un `<StatusTag>` à côté lit seulement le SIGNE déjà connu
 *   pour nommer l'état (« Dans le budget » / « Dépassement »), sans reprendre
 *   le calcul de l'écart lui-même ;
 * - l'alerte (`openAlert`) : présente ou non sur la ligne, rendue par un tag
 *   distinct, jamais confondue avec l'écart — un chantier peut avoir franchi
 *   un SEUIL d'alerte (`thresholdPercent`, souvent inférieur à 100 %) sans
 *   être en dépassement, et inversement un chantier sans budget n'a ni écart
 *   ni alerte (`variance` et `openAlert` valent alors tous deux `null`).
 *
 * **Acquittement d'une alerte.** Route dédiée (§5,
 * `POST budget-alerts/{alertId}/acknowledge`), confirmée mais sans la
 * solennité d'une validation ou d'une annulation : « une alerte informe, elle
 * n'interdit pas » (§6 du modèle).
 *
 * **Les filtres envoient un identifiant ou un code, jamais un libellé.**
 * `status` est le code brut (`PLANNED`, `IN_PROGRESS`…), au même titre que
 * `Chantiers.tsx` ; `onlyOverBudget` est un booléen porté par l'URL sous la
 * forme du texte `'true'`, l'unique valeur que `useListParams` sait
 * distinguer d'une absence de filtre.
 *
 * **Vocabulaire (P-1).** On *engage*, on *budgète*, jamais « débit » ni
 * « crédit ».
 */

type Filters = { status: string; onlyOverBudget: string };
const FILTER_KEYS = ['status', 'onlyOverBudget'] as const;

const OPTIONS_STATUT = Object.entries(SITE_STATUS_LABELS).map(([value, label]) => ({ value, label }));

/** Lit le SIGNE d'un écart déjà calculé — ne recalcule jamais l'écart lui-même. */
function toneEcart(variance: number | null): StatusTone {
  if (variance === null) return 'neutral';
  return variance < 0 ? 'danger' : 'success';
}

function labelEcart(variance: number | null): string {
  if (variance === null) return t('Sans budget');
  return variance < 0 ? t('Dépassement') : t('Dans le budget');
}

export const TableauDeBordChantiers: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useListParams<Filters>({ filterKeys: FILTER_KEYS });

  const filtresApi = {
    status: list.filters.status || undefined,
    onlyOverBudget: list.filters.onlyOverBudget === 'true'
  };

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('sites-dashboard', tenantId, {
      status: filtresApi.status,
      onlyOverBudget: filtresApi.onlyOverBudget ? 'true' : undefined
    }),
    queryFn: () => getSitesDashboard(tenantId as string, filtresApi),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const lignes = data?.rows ?? [];
  const nombreFiltres = [list.filters.status, list.filters.onlyOverBudget].filter(Boolean).length;

  const acquitter = async (ligne: SiteDashboardRow) => {
    if (!tenantId || !ligne.openAlert) return;
    try {
      await acknowledgeBudgetAlert(tenantId, ligne.openAlert.id);
      await queryClient.invalidateQueries({ queryKey: queryKey('sites-dashboard', tenantId, {}) });
    } catch {
      // Le message d'erreur générique suffit ici : acquitter une alerte n'a
      // pas de conséquence si l'on réessaie, contrairement à une validation.
    }
  };

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const ouvrirBudget = (ligne: SiteDashboardRow) =>
    navigate(`/tenant/${tenantId}/finance/chantiers/${ligne.siteId}/budget`);

  const colonnes: ColumnsType<SiteDashboardRow> = [
    { title: t('Chantier'), key: 'chantier', render: (_, r) => r.siteLabel },
    { title: t('Zone'), key: 'zone', render: (_, r) => r.zone || '—' },
    { title: t('Statut'), key: 'statut', render: (_, r) => <StatusTag status={r.status} /> },
    { title: t('Avancement'), key: 'avancement', align: 'end', render: (_, r) => `${r.progressPercent} %` },
    {
      title: t('Budget initial'),
      key: 'budget-initial',
      align: 'end',
      render: (_, r) => <MoneyValue value={r.initialBudget} />
    },
    {
      title: t('Budget révisé'),
      key: 'budget-revise',
      align: 'end',
      render: (_, r) => <MoneyValue value={r.revisedBudget} />
    },
    { title: t('Engagé'), key: 'engage', align: 'end', render: (_, r) => <MoneyValue value={r.engagedAmount} /> },
    { title: t('Réalisé'), key: 'realise', align: 'end', render: (_, r) => <MoneyValue value={r.actualCost} /> },
    {
      title: t('Écart'),
      key: 'ecart',
      align: 'end',
      // L'étiquette DIT le sens, le montant DIT de combien. L'étiquette seule
      // laissait la question la plus utile sans réponse — « dans le budget,
      // oui, mais avec quelle marge ? » — et obligeait à ouvrir le budget pour
      // un chiffre que la ligne portait déjà (demandé le 20 septembre 2026).
      // Un chantier sans budget n'a pas d'écart : l'étiquette « Sans budget »
      // reste seule, et `variance` vaut alors nul.
      render: (_, r) => (
        <Space size={4} wrap style={{ justifyContent: 'flex-end' }}>
          <StatusTag status={labelEcart(r.variance)} tone={toneEcart(r.variance)} label={labelEcart(r.variance)} />
          {r.variance !== null && <MoneyValue value={r.variance} signed />}
        </Space>
      )
    },
    {
      title: t('Alerte'),
      key: 'alerte',
      render: (_, r) =>
        r.openAlert ? (
          <Tooltip
            title={t('Seuil de {{thresholdPercent}} % franchi — {{consumedPercent}} % du budget consommé', {
              thresholdPercent: r.openAlert.thresholdPercent,
              consumedPercent: r.openAlert.consumedPercent
            })}
          >
            <StatusTag status="alerte" tone="danger" label={t('Alerte')} />
          </Tooltip>
        ) : (
          '—'
        )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, r) => (
        <Space size="small">
          <Button type="link" onClick={() => ouvrirBudget(r)}>
            {t('Voir le budget')}
          </Button>
          {r.openAlert && (
            <Button type="link" onClick={() => acquitter(r)}>
              {t("Acquitter l'alerte")}
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Tableau de bord des chantiers')}
        subtitle={lignes.length > 0 ? `${lignes.length} chantier${lignes.length > 1 ? 's' : ''}` : undefined}
      />

      <FilterSheet
        activeCount={nombreFiltres}
        onClear={() => list.setFilters({ status: undefined, onlyOverBudget: undefined })}
        title={t('Filtrer le tableau de bord')}
      >
        <div style={{ minWidth: 200 }}>
          <label htmlFor="filtre-tdb-statut">{t('Statut')}</label>
          <Select
            showSearch
            optionFilterProp="label"
            id="filtre-tdb-statut"
            style={{ width: '100%' }}
            placeholder={t('Tous les statuts')}
            allowClear
            value={list.filters.status || undefined}
            onChange={valeur => list.setFilters({ status: valeur })}
            options={OPTIONS_STATUT}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: 32 }}>
          <Checkbox
            checked={list.filters.onlyOverBudget === 'true'}
            onChange={event => list.setFilters({ onlyOverBudget: event.target.checked ? 'true' : undefined })}
          >
            {t('Chantiers en dépassement uniquement')}
          </Checkbox>
        </div>
      </FilterSheet>

      <DataView<SiteDashboardRow>
        // Le tableau de bord ne pagine pas (contrat gelé, §5 du modèle) : un
        // seul appel rend tous les chantiers de l'agence.
        paginated={false}
        scrollX={1200}
        items={lignes}
        total={lignes.length}
        page={1}
        pageSize={Math.max(lignes.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger le tableau de bord des chantiers.') : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={() => list.setFilters({ status: undefined, onlyOverBudget: undefined })}
        emptyDescription={t('Aucun chantier ne correspond à ces critères.')}
        columns={colonnes}
        rowKey={r => r.siteId}
        aria-label={t('Tableau de bord des chantiers')}
        renderCard={r => (
          <DataCard
            title={r.siteLabel}
            aria-label={r.siteLabel}
            subtitle={r.zone || undefined}
            status={<StatusTag status={r.status} />}
            highlight={<MoneyValue value={r.engagedAmount} />}
            fields={[
              { label: t('Budget initial'), value: <MoneyValue value={r.initialBudget} /> },
              { label: t('Budget révisé'), value: <MoneyValue value={r.revisedBudget} /> },
              { label: t('Réalisé'), value: <MoneyValue value={r.actualCost} /> },
              {
                label: t('Écart'),
                // Comme en colonne : l'étiquette dit le sens, le montant dit
                // de combien. Un chantier sans budget n'a que l'étiquette.
                value: (
                  <Space size={4} wrap>
                    <StatusTag
                      status={labelEcart(r.variance)}
                      tone={toneEcart(r.variance)}
                      label={labelEcart(r.variance)}
                    />
                    {r.variance !== null && <MoneyValue value={r.variance} signed />}
                  </Space>
                )
              },
              ...(r.openAlert
                ? [
                    {
                      label: t('Alerte'),
                      value: t('Seuil de {{thresholdPercent}} % franchi ({{consumedPercent}} %)', {
                        thresholdPercent: r.openAlert.thresholdPercent,
                        consumedPercent: r.openAlert.consumedPercent
                      })
                    }
                  ]
                : [])
            ]}
            primaryAction={{ label: t('Voir le budget'), onClick: () => ouvrirBudget(r) }}
            secondaryActions={
              r.openAlert
                ? [{ key: 'acquitter', label: t("Acquitter l'alerte"), onClick: () => acquitter(r) }]
                : undefined
            }
          />
        )}
      />
    </>
  );
};

export default TableauDeBordChantiers;
