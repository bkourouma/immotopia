import React, { useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SortOrder } from 'antd/es/table/interface';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { getClientsAgingBalance } from '../../services/finance-service';
import { getProperty, listProperties } from '../../services/property-service';
import type { BalanceFilters, ClientsAgingBalanceLine } from '../../types/finance-types';
import type { Sort } from '../../hooks/useListParams';
import { useListSearch } from '../../hooks/useListSearch';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { exportToCSV } from '../../utils/export-utils';
import { PageHeader, StateBlock, MoneyValue, DataView, DataCard, StatCard } from '../../components/primitives';
import { t } from '../../i18n/t';
import { useAgencyFeatures } from '../../hooks/useAgencyFeatures';
import { formatMoney } from '../../components/primitives/MoneyValue';
import { ModuleNotIncluded } from '../../components/primitives/ModuleNotIncluded';

/**
 * Balance âgée — récit 5 du lot 1 (specs/016-finance-operationnelle/spec.md).
 *
 * La même liste que `BalanceClients.tsx`, ventilée par ancienneté de
 * créance : à échoir, moins de 30 jours, 30 à 60, 60 à 90, plus de 90.
 * Duplique volontairement la structure de son écran jumeau plutôt que d'en
 * extraire une base commune : c'est le principe déjà suivi par
 * `pages/rental/Installments.tsx` et `Payments.tsx`, et le territoire de cet
 * agent n'inclut aucun fichier partagé où loger une factorisation.
 *
 * **Recherche en mode mixte.** Comme `BalanceClients.tsx` : locataire,
 * période et bien partent au serveur (les totaux suivent le périmètre
 * filtré), seule la découpe en pages est locale. Deux hooks lisent la même
 * URL : `useListSearch` donne les paramètres d'API avant la requête,
 * `useLocalListSearch` découpe et porte la barre.
 *
 * **Tri.** `ClientsAgingBalance` n'est pas paginée par l'API (comme sa
 * balance simple) et `BalanceFilters` ne porte pas de paramètre de tri : le
 * tri des cinq colonnes de tranche est donc appliqué CÔTÉ ÉCRAN, sur la
 * liste déjà reçue. Il vit malgré tout dans l'URL comme les autres écrans
 * hybrides (§10.1) — un tri partagé par copier-coller doit rester partagé
 * même quand il n'est pas transmis au serveur.
 */

/** Colonnes de tranche, dans l'ordre d'affichage — et les seules triables (récit 5). */
const CHAMPS_TRANCHES = ['notYetDue', 'days0To30', 'days30To60', 'days60To90', 'daysOver90'] as const;
type ChampTranche = (typeof CHAMPS_TRANCHES)[number];

/** Tri global, avant la découpe en pages (constante de module : mémoïsation stable). */
function trierLignes(lignes: ClientsAgingBalanceLine[], sort: Sort | null): ClientsAgingBalanceLine[] {
  if (!sort || !(CHAMPS_TRANCHES as readonly string[]).includes(sort.field)) return lignes;
  const champ = sort.field as ChampTranche;
  const sens = sort.order === 'asc' ? 1 : -1;
  return [...lignes].sort((a, b) => (Number(a[champ]) - Number(b[champ])) * sens);
}

/** Solde affiché d'une ligne : la somme des tranches, repli sur le solde comptable. */
const soldeLigne = (l: ClientsAgingBalanceLine): number => l.agedTotal ?? l.balance;

/** Mention discrète de l'écart avec la comptabilité ; rien quand il est nul ou absent. */
const MentionEcart: React.FC<{ gap?: number }> = ({ gap }) =>
  gap ? (
    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
      {t('Écart avec la comptabilité : {{montant}}', { montant: formatMoney(gap) })}
    </div>
  ) : null;

export const BalanceAgee: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  // Locatif : sans gestion locative (RENTAL), ni campagne ni balance de locataires (BUG-051).
  const features = useAgencyFeatures(tenantId);
  const navigate = useNavigate();

  // `loadOptions` et `resolveLabel` sont gelés au premier rendu : l'agence se lit par une ref.
  const tenantRef = useRef(tenantId);
  tenantRef.current = tenantId;

  // Tous les critères partent au serveur : aucun accesseur local, le filtrage
  // local les ignore.
  const criteres: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Nom du locataire…'), api: 'search' },
    {
      key: 'periode',
      type: 'dateRange',
      label: t('Période'),
      primary: true,
      urlKeys: ['from', 'to'],
      api: ['from', 'to']
    },
    {
      key: 'propertyId',
      type: 'select',
      label: t('Bien'),
      primary: true,
      loadOptions: async terme => {
        const { properties } = await listProperties(tenantRef.current as string, { q: terme || undefined, limit: 20 });
        return properties.map(bien => ({ value: bien.id, label: bien.title || bien.id }));
      },
      resolveLabel: async id => {
        const bien = await getProperty(tenantRef.current as string, id);
        return bien.title || id;
      }
    }
  ];
  const { filterParams } = useListSearch({ criteria: criteres });
  const filtresApi = filterParams as BalanceFilters;

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('clients-balance-agee', tenantId, filterParams),
    // `asOf` fixe le jour de référence des tranches à aujourd'hui : ce n'est
    // pas un filtre que la gestionnaire choisit, donc il ne vit pas dans
    // l'URL — à la différence de la période et du bien.
    queryFn: () => getClientsAgingBalance(tenantId as string, { ...filtresApi, asOf: dayjs().format('YYYY-MM-DD') }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const local = useLocalListSearch<ClientsAgingBalanceLine>(data?.lines, {
    criteria: criteres,
    sortItems: trierLignes
  });
  const lignes = local.filtered;

  const handleExport = () => {
    exportToCSV(
      lignes.map(l => ({
        Locataire: l.label,
        Biens: l.propertyLabels.join(' · '),
        Facturé: l.totalBilled,
        Réglé: l.totalSettled,
        Solde: soldeLigne(l),
        'Écart comptable': l.gap ?? 0,
        'À échoir': l.notYetDue,
        '< 30 jours': l.days0To30,
        '30 à 60 jours': l.days30To60,
        '60 à 90 jours': l.days60To90,
        '> 90 jours': l.daysOver90
      })),
      'balance-agee'
    );
  };

  const ouvrirReleve = (ligne: ClientsAgingBalanceLine) =>
    navigate(`/tenant/${tenantId}/finance/comptes/${ligne.accountId}`);

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  if (features.ready && !features.has('RENTAL')) {
    return <ModuleNotIncluded />;
  }

  /** Icône de tri courant pour une colonne de tranche donnée. */
  const sortOrderPour = (champ: ChampTranche): SortOrder | null =>
    local.sort?.field === champ ? (local.sort.order === 'asc' ? 'ascend' : 'descend') : null;

  const colonneTranche = (titre: string, champ: ChampTranche): ColumnsType<ClientsAgingBalanceLine>[number] => ({
    title: titre,
    key: champ,
    // `dataIndex` est nécessaire pour qu'Ant Design rapporte `field` dans le
    // résultat de tri : `<DataView>` l'exige pour convertir le tri vers le
    // contrat serveur (`hooks/useListParams.ts`, `Sort`), même si `render`
    // reprend la ligne entière plutôt que la valeur extraite.
    dataIndex: champ,
    align: 'end',
    sorter: true,
    sortOrder: sortOrderPour(champ),
    render: (_: unknown, l: ClientsAgingBalanceLine) => <MoneyValue value={l[champ]} />
  });

  const colonnes: ColumnsType<ClientsAgingBalanceLine> = [
    { title: t('Locataire'), key: 'locataire', render: (_, l) => l.label },
    {
      title: t('Biens'),
      key: 'biens',
      render: (_, l) => (l.propertyLabels.length > 0 ? l.propertyLabels.join(' · ') : '—')
    },
    {
      title: t('Solde'),
      key: 'solde',
      align: 'end',
      exportValue: l => soldeLigne(l),
      render: (_, l) => (
        <>
          <MoneyValue value={soldeLigne(l)} signed />
          <MentionEcart gap={l.gap} />
        </>
      )
    },
    colonneTranche(t('À échoir'), 'notYetDue'),
    colonneTranche('< 30 jours', 'days0To30'),
    colonneTranche(t('30 à 60 jours'), 'days30To60'),
    colonneTranche(t('60 à 90 jours'), 'days60To90'),
    colonneTranche('> 90 jours', 'daysOver90'),
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
        title={t('Balance âgée')}
        subtitle={lignes.length > 0 ? `${lignes.length} locataire${lignes.length > 1 ? 's' : ''}` : undefined}
        primaryAction={{ label: t('Exporter'), icon: <DownloadOutlined />, onClick: handleExport }}
      />

      <DataView<ClientsAgingBalanceLine>
        // Pagination locale de la liste reçue : l'API rend la balance
        // entière et ses totaux (ceux du serveur, jamais recalculés ici).
        {...local.dataViewProps}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger la balance âgée.') : null}
        errorCause={erreurRequete}
        onRetry={() => refetch()}
        emptyDescription={t('Aucun compte de locataire enregistré.')}
        columns={colonnes}
        rowKey={l => l.accountId}
        aria-label={t('Balance âgée')}
        export={{ filename: t('Balance âgée'), fetchAll: local.exportAll }}
        // Neuf colonnes hors « Actions » : elles ne tiennent pas dans les
        // ~690 px utiles au plancher du desktop (voir la même remarque dans
        // `pages/rental/Payments.tsx`).
        scrollX={1320}
        renderCard={l => (
          <DataCard
            title={l.label}
            aria-label={l.label}
            subtitle={l.propertyLabels.length > 0 ? l.propertyLabels.join(' · ') : undefined}
            highlight={
              <>
                <MoneyValue value={soldeLigne(l)} signed />
                <MentionEcart gap={l.gap} />
              </>
            }
            fields={[
              { label: t('À échoir'), value: <MoneyValue value={l.notYetDue} /> },
              { label: '< 30 jours', value: <MoneyValue value={l.days0To30} /> },
              { label: t('30 à 60 jours'), value: <MoneyValue value={l.days30To60} /> },
              { label: t('60 à 90 jours'), value: <MoneyValue value={l.days60To90} /> },
              { label: '> 90 jours', value: <MoneyValue value={l.daysOver90} /> }
            ]}
            onOpen={() => ouvrirReleve(l)}
          />
        )}
      />

      {data && lignes.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)', maxWidth: 320 }}>
          <StatCard label={t('Total de contrôle')} value={<MoneyValue value={data.totalBalance} signed />} />
          <MentionEcart gap={data.gap} />
        </div>
      )}
    </>
  );
};
