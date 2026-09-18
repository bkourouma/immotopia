import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, DatePicker, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { getClientsBalance } from '../../services/finance-service';
import type { ClientsBalanceLine } from '../../types/finance-types';
import { useListParams } from '../../hooks/useListParams';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { exportToCSV } from '../../utils/export-utils';
import {
  PageHeader,
  StateBlock,
  MoneyValue,
  DataView,
  DataCard,
  FilterSheet,
  StatCard
} from '../../components/primitives';

/**
 * Balance clients — récit 1 du lot 1 (specs/016-finance-operationnelle/spec.md).
 *
 * L'écran qui lève la réserve « ce n'est pas chiffré » : une ligne par
 * locataire, le total facturé, le total réglé et le solde, sans aucune
 * saisie. Construit sur le même modèle que les deux écrans hybrides de la
 * refonte locative (`pages/rental/Installments.tsx`, `Payments.tsx`) :
 * mêmes primitives, même état de liste porté par l'URL, mêmes trois états
 * (chargement, vide, erreur) délégués à `<DataView>`.
 *
 * **Aucune pagination.** `ClientsBalance` ne porte pas d'enveloppe de
 * pagination : l'API rend la balance entière, comme le fait déjà l'écran
 * des pénalités (`pages/rental/Penalties.tsx`). `paginated={false}` le dit
 * explicitement plutôt que de le laisser deviner.
 *
 * **Vocabulaire (P-1 du PRD).** Les colonnes disent « Facturé » et
 * « Réglé » — jamais « débit » ni « crédit ». Un test dédié
 * (`__tests__/finance/balances.test.tsx`) échoue si l'un de ces deux mots
 * s'y glisse.
 *
 * **Montants.** Toujours par `<MoneyValue>`, sans préciser `currency` : la
 * devise stockée (`XOF`) s'affiche « FCFA » par le défaut du composant —
 * jamais un suffixe écrit en dur ici (contrat gelé, `finance-types.ts`).
 */

type Filters = { from: string; to: string; propertyId: string };
const FILTER_KEYS = ['from', 'to', 'propertyId'] as const;

const { RangePicker } = DatePicker;

export const BalanceClients: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const list = useListParams<Filters>({ filterKeys: FILTER_KEYS });

  const filtresPeriode = {
    from: list.filters.from || undefined,
    to: list.filters.to || undefined
  };
  const filtresApi = { ...filtresPeriode, propertyId: list.filters.propertyId || undefined };

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('clients-balance', tenantId, filtresApi),
    queryFn: () => getClientsBalance(tenantId as string, filtresApi),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  /**
   * Options du filtre « Bien », dérivées de la balance sur la même période
   * mais SANS le filtre de bien — le même principe que le filtre locataire
   * des échéances (`optionsLocatairesDesBaux`) : choisir un bien ne doit pas
   * faire disparaître les autres de la liste déroulante.
   *
   * Le contrat gelé (`ClientsBalanceLine`) n'expose qu'un libellé de bien
   * (`propertyLabels`), jamais un identifiant : il n'existe pas d'endpoint
   * pour lister les biens indépendamment de la balance. Le filtre envoie
   * donc le libellé lui-même comme valeur de `propertyId` — un choix par
   * défaut, faute de mieux, documenté au rapport de livraison.
   */
  const { data: donneesPourFiltre } = useQuery({
    queryKey: queryKey('clients-balance', tenantId, { ...filtresPeriode, pour: 'filtre-bien' }),
    queryFn: () => getClientsBalance(tenantId as string, filtresPeriode),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const optionsBiens = React.useMemo(() => {
    const labels = new Set<string>();
    for (const ligne of donneesPourFiltre?.lines ?? []) {
      for (const bien of ligne.propertyLabels) labels.add(bien);
    }
    return Array.from(labels)
      .sort((a, b) => a.localeCompare(b))
      .map(label => ({ value: label, label }));
  }, [donneesPourFiltre]);

  const lignes = data?.lines ?? [];

  const handleExport = () => {
    exportToCSV(
      lignes.map(l => ({
        Locataire: l.label,
        Biens: l.propertyLabels.join(' · '),
        Facturé: l.totalBilled,
        Réglé: l.totalSettled,
        Solde: l.balance
      })),
      'balance-clients'
    );
  };

  const ouvrirReleve = (ligne: ClientsBalanceLine) =>
    navigate(`/tenant/${tenantId}/finance/comptes/${ligne.accountId}`);

  if (!tenantId) {
    return <StateBlock variant="empty" title="Aucune agence sélectionnée" />;
  }

  const colonnes: ColumnsType<ClientsBalanceLine> = [
    { title: 'Locataire', key: 'locataire', render: (_, l) => l.label },
    {
      title: 'Biens',
      key: 'biens',
      render: (_, l) => (l.propertyLabels.length > 0 ? l.propertyLabels.join(' · ') : '—')
    },
    {
      title: 'Facturé',
      key: 'facture',
      align: 'right',
      render: (_, l) => <MoneyValue value={l.totalBilled} />
    },
    {
      title: 'Réglé',
      key: 'regle',
      align: 'right',
      render: (_, l) => <MoneyValue value={l.totalSettled} />
    },
    {
      title: 'Solde',
      key: 'solde',
      align: 'right',
      render: (_, l) => <MoneyValue value={l.balance} signed />
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      render: (_, l) => (
        <Button type="link" onClick={() => ouvrirReleve(l)}>
          Voir le relevé
        </Button>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title="Balance clients"
        subtitle={lignes.length > 0 ? `${lignes.length} locataire${lignes.length > 1 ? 's' : ''}` : undefined}
        primaryAction={{ label: 'Exporter', icon: <DownloadOutlined />, onClick: handleExport }}
      />

      <FilterSheet
        activeCount={Object.keys(list.filters).length}
        onClear={list.clearFilters}
        title="Filtrer la balance"
      >
        <div style={{ minWidth: 260 }}>
          <label htmlFor="filtre-periode-balance">Période</label>
          <RangePicker
            id="filtre-periode-balance"
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
          <label htmlFor="filtre-bien-balance">Bien</label>
          <Select
            id="filtre-bien-balance"
            style={{ width: '100%' }}
            placeholder="Tous les biens"
            allowClear
            showSearch
            optionFilterProp="label"
            value={list.filters.propertyId || undefined}
            onChange={value => list.setFilters({ propertyId: value })}
            options={optionsBiens}
          />
        </div>
      </FilterSheet>

      <DataView<ClientsBalanceLine>
        // La balance n'est pas paginée : l'API la rend entière, comme les
        // pénalités (`pages/rental/Penalties.tsx`). `total` est donc le
        // compte réel des lignes reçues, pas un artifice.
        paginated={false}
        items={lignes}
        total={lignes.length}
        page={1}
        pageSize={Math.max(lignes.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? 'Impossible de charger la balance clients.' : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={list.clearFilters}
        emptyDescription="Aucun compte de locataire enregistré."
        columns={colonnes}
        rowKey={l => l.accountId}
        aria-label="Balance clients"
        renderCard={l => (
          <DataCard
            title={l.label}
            aria-label={l.label}
            subtitle={l.propertyLabels.length > 0 ? l.propertyLabels.join(' · ') : undefined}
            highlight={<MoneyValue value={l.balance} signed />}
            fields={[
              { label: 'Facturé', value: <MoneyValue value={l.totalBilled} /> },
              { label: 'Réglé', value: <MoneyValue value={l.totalSettled} /> }
            ]}
            onOpen={() => ouvrirReleve(l)}
          />
        )}
      />

      {/* Total de contrôle, en pied de liste : la somme des soldes affichés,
          rendue par le même `<StatCard>` que les indicateurs du tableau de
          bord — pas un total réinventé au fil de l'écran. */}
      {data && lignes.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)', maxWidth: 320 }}>
          <StatCard label="Total de contrôle" value={<MoneyValue value={data.totalBalance} signed />} />
        </div>
      )}
    </>
  );
};
