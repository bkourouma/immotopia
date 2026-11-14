import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { getSuppliersBalance, listConstructionSites } from '../../services/finance-lot2-service';
import type { SuppliersBalanceLine } from '../../types/finance-lot2-types';
import { useListSearch } from '../../hooks/useListSearch';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, DataView, DataCard, StatCard } from '../../components/primitives';
import { t } from '../../i18n/t';

/**
 * Balance fournisseurs — récit 5 du lot 2
 * (`specs/017-finance-fournisseurs-chantiers/spec.md`), miroir exact de
 * `BalanceClients.tsx` (lot 1) : une ligne par fournisseur, ce que l'agence
 * lui doit, filtrable par période et par chantier, un total de contrôle en
 * pied de liste. Même modèle, mêmes primitives, mêmes trois états délégués à
 * `<DataView>`.
 *
 * **Pagination.** `SuppliersBalance` n'est pas paginée par l'API : la liste
 * reçue en entier est découpée localement (20 par page) par la recherche.
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
 *
 * **Recherche (mode mixte).** La période et le chantier CHANGENT les montants
 * calculés par le serveur : ils restent envoyés à `getSuppliersBalance` (critères
 * déclarés sans accesseur, donc ignorés par le filtrage local). Le champ libre
 * et l'intervalle de solde filtrent la liste reçue (`api: false`). Deux hooks
 * lisent les mêmes critères dans l'URL : `useListSearch` avant la requête (ses
 * paramètres d'API), `useLocalListSearch` après (filtrage et pagination).
 */

// Champ libre : le fournisseur affiché.
const TEXTE_RECHERCHE = [(l: SuppliersBalanceLine) => l.label];

// Valeur lue par les critères locaux non textuels (le solde existant, sans calcul).
const ACCESSEURS = {
  solde: (l: SuppliersBalanceLine) => l.balance
};

/** Paramètres d'API (valeurs textuelles) vers le type du service. */
type FiltresBalance = { from?: string; to?: string; siteId?: string };
function filtresDeLaBalance(params: Record<string, string | number>): FiltresBalance {
  const texte = (valeur: string | number | undefined) => (valeur === undefined ? undefined : String(valeur));
  return { from: texte(params.from), to: texte(params.to), siteId: texte(params.siteId) };
}

export const BalanceFournisseurs: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

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

  // Déclarés dans le corps : les libellés se retraduisent au changement de langue.
  const criteres: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Fournisseur…'),
      api: false
    },
    // Période et chantier : envoyés à l'API (ils changent les montants), sans accesseur local.
    { key: 'periode', type: 'dateRange', label: t('Période'), primary: true, api: ['from', 'to'] },
    { key: 'chantier', type: 'select', label: t('Chantier'), primary: true, api: 'siteId', options: optionsChantiers },
    { key: 'solde', type: 'numberRange', label: t('Solde'), unit: 'FCFA', api: false }
  ];

  // Les critères de l'API se lisent dans l'URL avant la requête ; le filtrage
  // local (plus bas) relit les mêmes clés une fois la liste reçue.
  const critereApi = useListSearch({ criteria: criteres });
  const filtresApi = filtresDeLaBalance(critereApi.filterParams);

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

  const lignes = React.useMemo(() => data?.lines ?? [], [data]);
  const local = useLocalListSearch<SuppliersBalanceLine>(lignes, {
    criteria: criteres,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

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
        helpId="finance.balance-fournisseurs.page"
        title={t('Balance fournisseurs')}
        subtitle={lignes.length > 0 ? `${lignes.length} fournisseur${lignes.length > 1 ? 's' : ''}` : undefined}
      />

      <DataView<SuppliersBalanceLine>
        helpId="finance.balance-fournisseurs.tableau"
        {...local.dataViewProps}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger la balance fournisseurs.') : null}
        errorCause={erreurRequete}
        onRetry={() => refetch()}
        emptyDescription={t('Aucun fournisseur enregistré.')}
        columns={colonnes}
        rowKey={l => l.accountId}
        aria-label={t('Balance fournisseurs')}
        export={{ filename: t('Balance fournisseurs'), fetchAll: local.exportAll }}
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

      {/* Total de contrôle, en pied de liste : la somme des soldes affichés. Masqué quand le champ
          libre ou l'intervalle de solde restreignent la liste reçue : il ne serait plus celui des lignes visibles. */}
      {data && lignes.length > 0 && local.total === lignes.length && (
        <div style={{ marginTop: 'var(--space-4)', maxWidth: 320 }}>
          <StatCard
            helpId="finance.balance-fournisseurs.total"
            label={t('Total de contrôle')}
            value={<MoneyValue value={data.totalBalance} signed />}
          />
        </div>
      )}
    </>
  );
};
