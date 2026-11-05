import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getClientsBalance, listClientBalanceProperties } from '../../services/finance-service';
import type { BalanceFilters, ClientsBalanceLine } from '../../types/finance-types';
import { useListSearch } from '../../hooks/useListSearch';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { exportToCSV } from '../../utils/export-utils';
import { PageHeader, StateBlock, MoneyValue, DataView, DataCard, StatCard } from '../../components/primitives';
import { t } from '../../i18n/t';
import { useAgencyFeatures } from '../../hooks/useAgencyFeatures';
import { ModuleNotIncluded } from '../../components/primitives/ModuleNotIncluded';

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
 * **Recherche en mode mixte** (guide : `docs/architecture/recherche-listes.md`).
 * `ClientsBalance` ne porte pas d'enveloppe de pagination : l'API rend la
 * balance entière avec ses totaux. Tous les critères (locataire, période,
 * bien) partent au serveur, parce que les totaux doivent suivre le périmètre
 * filtré : un filtre local contredirait le total de contrôle. Seule la
 * découpe en pages (20 par page, dans l'URL) est locale ; l'export porte la
 * liste complète.
 *
 * Deux hooks lisent la même URL : `useListSearch` donne les paramètres d'API
 * AVANT la requête (`useLocalListSearch` a besoin de la liste reçue, donc de
 * la requête), `useLocalListSearch` découpe en pages et porte la barre.
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

export const BalanceClients: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  // Locatif : sans gestion locative (RENTAL), ni campagne ni balance de locataires (BUG-051).
  const features = useAgencyFeatures(tenantId);
  const navigate = useNavigate();

  /** Options du filtre sous le même droit de lecture financier que la balance. */
  const { data: parc } = useQuery({
    queryKey: queryKey('finance-balance-properties', tenantId, {}),
    queryFn: () => listClientBalanceProperties(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });
  const optionsBiens = React.useMemo(
    () =>
      (parc ?? []).map(bien => ({ value: bien.id, label: bien.title })).sort((a, b) => a.label.localeCompare(b.label)),
    [parc]
  );

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
      loadOptions: async terme =>
        optionsBiens.filter(bien => bien.label.toLocaleLowerCase().includes(terme.toLocaleLowerCase())).slice(0, 20),
      resolveLabel: async id => optionsBiens.find(bien => bien.value === id)?.label ?? id
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
    queryKey: queryKey('clients-balance', tenantId, filterParams),
    queryFn: () => getClientsBalance(tenantId as string, filtresApi),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const local = useLocalListSearch<ClientsBalanceLine>(data?.lines, { criteria: criteres });
  const lignes = local.filtered;

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
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  if (features.ready && !features.has('RENTAL')) {
    return <ModuleNotIncluded />;
  }

  const colonnes: ColumnsType<ClientsBalanceLine> = [
    { title: t('Locataire'), key: 'locataire', render: (_, l) => l.label },
    {
      title: t('Biens'),
      key: 'biens',
      render: (_, l) => (l.propertyLabels.length > 0 ? l.propertyLabels.join(' · ') : '—')
    },
    {
      title: t('Facturé'),
      key: 'facture',
      align: 'end',
      exportValue: l => l.totalBilled,
      render: (_, l) => <MoneyValue value={l.totalBilled} />
    },
    {
      title: t('Réglé'),
      key: 'regle',
      align: 'end',
      exportValue: l => l.totalSettled,
      render: (_, l) => <MoneyValue value={l.totalSettled} />
    },
    {
      title: t('Solde'),
      key: 'solde',
      align: 'end',
      exportValue: l => l.balance,
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
        title={t('Balance clients')}
        subtitle={lignes.length > 0 ? `${lignes.length} locataire${lignes.length > 1 ? 's' : ''}` : undefined}
        primaryAction={{ label: t('Exporter'), icon: <DownloadOutlined />, onClick: handleExport }}
      />

      {(filtresApi.from || filtresApi.to) && (
        <p role="note" style={{ margin: '0 0 12px', opacity: 0.75 }}>
          {t('Période filtrée : le solde est celui à la fin de la période.')}
        </p>
      )}

      <DataView<ClientsBalanceLine>
        // Pagination locale de la liste reçue : l'API rend la balance
        // entière et ses totaux (ceux du serveur, jamais recalculés ici).
        {...local.dataViewProps}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger la balance clients.') : null}
        errorCause={erreurRequete}
        onRetry={() => refetch()}
        emptyDescription={t('Aucun compte de locataire enregistré.')}
        columns={colonnes}
        rowKey={l => l.accountId}
        aria-label={t('Balance clients')}
        export={{ filename: t('Balance clients'), fetchAll: local.exportAll }}
        renderCard={l => (
          <DataCard
            title={l.label}
            aria-label={l.label}
            subtitle={l.propertyLabels.length > 0 ? l.propertyLabels.join(' · ') : undefined}
            highlight={<MoneyValue value={l.balance} signed />}
            fields={[
              { label: t('Facturé'), value: <MoneyValue value={l.totalBilled} /> },
              { label: t('Réglé'), value: <MoneyValue value={l.totalSettled} /> }
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
          <StatCard label={t('Total de contrôle')} value={<MoneyValue value={data.totalBalance} signed />} />
        </div>
      )}
    </>
  );
};
