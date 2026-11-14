import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { listPurchaseOrders } from '../../services/finance-lot3-service';
import { getSupplier, listConstructionSites, listSuppliersPage } from '../../services/finance-lot2-service';
import { INVOICING_STATE_LABELS, PURCHASE_ORDER_STATUS_LABELS } from '../../types/finance-lot3-types';
import type { PurchaseOrder, PurchaseOrderStatus } from '../../types/finance-lot3-types';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, DataView, DataCard, StatusTag } from '../../components/primitives';
import type { StatusTone } from '../../components/primitives';
import { t } from '../../i18n/t';
import { localizedList } from '../../i18n/localized';
import { CLE_DUPLICATION_BON, copieDuBon } from '../../utils/duplication-piece';
import type { DuplicationBonDeCommande } from '../../utils/duplication-piece';

import { activeLocale } from '../../i18n/format';
/**
 * Bons de commande — liste filtrable, lot 3
 * (specs/018-finance-budget-pilotage/data-model.md §5,
 * `GET /tenants/{tenantId}/finance/purchase-orders`).
 *
 * Construit sur le modèle de `BalanceFournisseurs.tsx` et `Chantiers.tsx` :
 * l'état de liste (recherche multicritères) vit dans l'URL par
 * `useLocalListSearch`, les trois états sont délégués à `<DataView>`, et les options des filtres « Chantier »
 * et « Fournisseur » viennent de `listConstructionSites` / `listSuppliersPage`
 * (lot 2) plutôt que de la liste des bons elle-même — la liste ne porte que
 * des libellés, jamais un jeu d'identifiants complet. Les fournisseurs sont
 * recherchés côté serveur par pages de 20 ; un choix issu de l'URL est résolu
 * séparément quand il n'est pas dans la page courante.
 *
 * **Les critères portent un IDENTIFIANT, jamais un libellé.** C'est le défaut
 * relevé au lot 1 (un filtre par bien envoyait le nom du bien) : les listes
 * « Chantier » et « Fournisseur » ont pour valeur l'identifiant
 * (`site.id`, `supplier.id`), jamais `site.name` ni `supplier.name` — seul
 * `label` porte le texte affiché à l'utilisateur.
 *
 * **Recherche locale, pagination à 20.** `listPurchaseOrders` rend la liste en
 * entier (`PurchaseOrderFilters` ne documente ni `page` ni `limit`, contrat
 * gelé) : tous les critères (statut, chantier, fournisseur, date, facturation,
 * montant, champ libre) filtrent cette liste côté client, et aucun n'est
 * envoyé à l'API. Les clés d'URL `status`, `siteId` et `supplierId` sont
 * conservées pour les liens existants.
 *
 * **Dupliquer, sur chaque ligne.** Une action secondaire — un `<Button
 * type="link">`, comme « Voir le détail » juste à côté, qui est la convention
 * de cet écran — mène à la saisie d'un nouveau bon **pré-remplie** par le bon
 * cliqué : chantier, fournisseur et lignes. Elle n'écrit RIEN : la copie
 * voyage dans l'état de navigation de react-router (voir
 * `utils/duplication-piece.ts`), et la pièce ne naît qu'au bouton
 * d'enregistrement habituel. Offerte quel que soit le statut, **annulé
 * compris** : on annule justement pour ressaisir.
 *
 * **Vocabulaire (P-1).** Le statut du bon (brouillon/émis/annulé) et son état
 * de facturation (non facturé/partiellement facturé/soldé) sont deux choses
 * distinctes (§4 du modèle) ; ni l'un ni l'autre ne prononce jamais « débit »
 * ni « crédit ».
 */

const OPTIONS_STATUT = localizedList(() =>
  Object.entries(PURCHASE_ORDER_STATUS_LABELS).map(([value, label]) => ({ value, label }))
);

const OPTIONS_FACTURATION = localizedList(() =>
  Object.entries(INVOICING_STATE_LABELS).map(([value, label]) => ({ value, label }))
);

// Champ libre : référence, chantier et fournisseur, tels qu'affichés.
const TEXTE_RECHERCHE = [
  (b: PurchaseOrder) => b.reference,
  (b: PurchaseOrder) => b.siteLabel,
  (b: PurchaseOrder) => b.supplierLabel
];

// Valeur lue par les critères non textuels, par clé de critère.
const ACCESSEURS = {
  status: (b: PurchaseOrder) => b.status,
  siteId: (b: PurchaseOrder) => b.siteId,
  supplierId: (b: PurchaseOrder) => b.supplierId,
  date: (b: PurchaseOrder) => b.orderDate,
  facturation: (b: PurchaseOrder) => b.invoicingState,
  montant: (b: PurchaseOrder) => b.totalAmount
};

const TONE_STATUT: Record<PurchaseOrderStatus, StatusTone> = {
  DRAFT: 'neutral',
  ISSUED: 'success',
  CANCELLED: 'danger'
};

const TONE_FACTURATION: Record<PurchaseOrder['invoicingState'], StatusTone> = {
  NOT_INVOICED: 'neutral',
  PARTIALLY_INVOICED: 'warning',
  SETTLED: 'success'
};

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

export const BonsDeCommande: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('purchase-orders', tenantId, {}),
    queryFn: () => listPurchaseOrders(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const { data: chantiers } = useQuery({
    queryKey: queryKey('construction-sites', tenantId, {}),
    queryFn: () => listConstructionSites(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const optionsChantiers = useMemo(
    () =>
      (chantiers ?? [])
        .map(chantier => ({ value: chantier.id, label: chantier.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [chantiers]
  );

  const bons = useMemo(() => data ?? [], [data]);

  // Déclarés dans le corps : les libellés se retraduisent au changement de langue.
  // Tous les critères filtrent la liste reçue en entier (aucun n'est envoyé à l'API).
  const criteres: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Référence, chantier, fournisseur…')
    },
    { key: 'status', type: 'select', label: t('Statut'), primary: true, options: OPTIONS_STATUT },
    { key: 'siteId', type: 'select', label: t('Chantier'), primary: true, options: optionsChantiers },
    {
      key: 'supplierId',
      type: 'select',
      label: t('Fournisseur'),
      primary: true,
      loadOptionsPage: async (term, page) => {
        const result = await listSuppliersPage(tenantId as string, { search: term, isActive: true, page, limit: 20 });
        return {
          items: result.items.map(supplier => ({ value: supplier.id, label: supplier.name })),
          total: result.total
        };
      },
      resolveLabel: async id => (await getSupplier(tenantId as string, id)).name
    },
    { key: 'date', type: 'dateRange', label: t('Date') },
    { key: 'facturation', type: 'select', label: t('Facturation'), options: OPTIONS_FACTURATION },
    { key: 'montant', type: 'numberRange', label: t('Montant total'), unit: 'FCFA' }
  ];
  const local = useLocalListSearch<PurchaseOrder>(bons, {
    criteria: criteres,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const ouvrirBon = (bon: PurchaseOrder) => navigate(`/tenant/${tenantId}/finance/bons-de-commande/${bon.id}`);
  const ouvrirNouveauBon = () => navigate(`/tenant/${tenantId}/finance/bons-de-commande/nouveau`);
  const dupliquerBon = (bon: PurchaseOrder) =>
    navigate(`/tenant/${tenantId}/finance/bons-de-commande/nouveau`, {
      state: { [CLE_DUPLICATION_BON]: copieDuBon(bon) satisfies DuplicationBonDeCommande }
    });

  const colonnes: ColumnsType<PurchaseOrder> = [
    { title: t('Référence'), key: 'reference', render: (_, b) => b.reference },
    { title: t('Chantier'), key: 'chantier', render: (_, b) => b.siteLabel },
    { title: t('Fournisseur'), key: 'fournisseur', render: (_, b) => b.supplierLabel },
    { title: t('Date'), key: 'date', render: (_, b) => dateCourte(b.orderDate) },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, b) => (
        <StatusTag status={b.status} tone={TONE_STATUT[b.status]} label={PURCHASE_ORDER_STATUS_LABELS[b.status]} />
      )
    },
    {
      title: t('Facturation'),
      key: 'facturation',
      render: (_, b) => (
        <StatusTag
          status={b.invoicingState}
          tone={TONE_FACTURATION[b.invoicingState]}
          label={INVOICING_STATE_LABELS[b.invoicingState]}
        />
      )
    },
    {
      title: t('Montant total'),
      key: 'montant',
      align: 'end',
      exportValue: b => b.totalAmount,
      render: (_, b) => <MoneyValue value={b.totalAmount} />
    },
    {
      title: t('Reste à facturer'),
      key: 'reste',
      align: 'end',
      exportValue: b => b.remainingAmount,
      render: (_, b) => <MoneyValue value={b.remainingAmount} />
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, b) => (
        <Space size="small">
          <Button type="link" onClick={() => ouvrirBon(b)}>
            {t('Voir le détail')}
          </Button>
          <Button type="link" onClick={() => dupliquerBon(b)}>
            {t('Dupliquer')}
          </Button>
        </Space>
      )
    }
  ];

  return (
    <>
      <PageHeader
        helpId="finance.bons-de-commande.page"
        title={t('Bons de commande')}
        subtitle={bons.length > 0 ? `${bons.length} bon${bons.length > 1 ? 's' : ''}` : undefined}
        primaryAction={{ label: t('Nouveau bon'), icon: <PlusOutlined />, onClick: ouvrirNouveauBon }}
      />

      <DataView<PurchaseOrder>
        helpId="finance.bons-de-commande.tableau"
        key={tenantId}
        {...local.dataViewProps}
        scrollX={1080}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger les bons de commande.') : null}
        errorCause={erreurRequete}
        onRetry={() => refetch()}
        emptyDescription={t("Aucun bon de commande n'est encore enregistré.")}
        emptyAction={{ label: t('Nouveau bon'), onClick: ouvrirNouveauBon }}
        columns={colonnes}
        rowKey={b => b.id}
        aria-label={t('Bons de commande')}
        export={{ filename: t('Bons de commande'), fetchAll: local.exportAll }}
        renderCard={b => (
          <DataCard
            title={b.reference}
            aria-label={t('Bon {{reference}}', { reference: b.reference })}
            subtitle={`${b.siteLabel} · ${b.supplierLabel}`}
            status={
              <StatusTag
                status={b.status}
                tone={TONE_STATUT[b.status]}
                label={PURCHASE_ORDER_STATUS_LABELS[b.status]}
              />
            }
            highlight={<MoneyValue value={b.totalAmount} />}
            fields={[
              { label: t('Date'), value: dateCourte(b.orderDate) },
              {
                label: t('Facturation'),
                value: (
                  <StatusTag
                    status={b.invoicingState}
                    tone={TONE_FACTURATION[b.invoicingState]}
                    label={INVOICING_STATE_LABELS[b.invoicingState]}
                  />
                )
              },
              { label: t('Reste à facturer'), value: <MoneyValue value={b.remainingAmount} /> }
            ]}
            onOpen={() => ouvrirBon(b)}
            secondaryActions={[{ key: 'dupliquer', label: t('Dupliquer'), onClick: () => dupliquerBon(b) }]}
          />
        )}
      />
    </>
  );
};

export default BonsDeCommande;
