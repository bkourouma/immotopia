import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, DatePicker } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { getClientsBalance } from '../../services/finance-service';
import type { ClientsBalanceLine } from '../../types/finance-types';
import { useListParams } from '../../hooks/useListParams';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { exportToCSV } from '../../utils/export-utils';
import { PropertyRemoteSelect } from '../../components/finance/PropertyRemoteSelect';
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
 * **Pagination locale.** `ClientsBalance` ne porte pas d'enveloppe de
 * pagination : l'API rend la balance entière avec ses totaux. L'écran en
 * affiche 20 lignes par page (page et taille dans l'URL) ; les totaux restent
 * ceux du serveur et l'export porte la liste complète.
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
  // Locatif : sans gestion locative (RENTAL), ni campagne ni balance de locataires (BUG-051).
  const features = useAgencyFeatures(tenantId);
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

  const lignes = data?.lines ?? [];

  // Page demandée ramenée dans les bornes de la liste reçue (une URL partagée
  // peut viser une page qui n'existe plus après un filtre).
  const pageMax = Math.max(1, Math.ceil(lignes.length / list.pageSize));
  const pageCourante = Math.min(list.page, pageMax);
  const lignesPage = lignes.slice((pageCourante - 1) * list.pageSize, pageCourante * list.pageSize);

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

      <FilterSheet
        activeCount={Object.keys(list.filters).length}
        onClear={list.clearFilters}
        title={t('Filtrer la balance')}
      >
        <div style={{ minWidth: 260 }}>
          <label htmlFor="filtre-periode-balance">{t('Période')}</label>
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
          <label htmlFor="filtre-bien-balance">{t('Bien')}</label>
          <PropertyRemoteSelect
            id="filtre-bien-balance"
            tenantId={tenantId}
            style={{ width: '100%' }}
            placeholder={t('Tous les biens')}
            value={list.filters.propertyId || undefined}
            onChange={id => list.setFilters({ propertyId: id })}
          />
        </div>
      </FilterSheet>

      {(filtresPeriode.from || filtresPeriode.to) && (
        <p role="note" style={{ margin: '0 0 12px', opacity: 0.75 }}>
          {t('Période filtrée : le solde est celui à la fin de la période.')}
        </p>
      )}

      <DataView<ClientsBalanceLine>
        // Pagination locale de la liste reçue : l'API rend la balance
        // entière et ses totaux (ceux du serveur, jamais recalculés ici).
        paginated
        items={lignesPage}
        total={lignes.length}
        page={pageCourante}
        pageSize={list.pageSize}
        onPageChange={(page, taille) => (taille !== list.pageSize ? list.setPageSize(taille) : list.setPage(page))}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger la balance clients.') : null}
        errorCause={erreurRequete}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={list.clearFilters}
        emptyDescription={t('Aucun compte de locataire enregistré.')}
        columns={colonnes}
        rowKey={l => l.accountId}
        aria-label={t('Balance clients')}
        export={{ filename: t('Balance clients'), fetchAll: async () => lignes }}
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
