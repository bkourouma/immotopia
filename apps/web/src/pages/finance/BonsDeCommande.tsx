import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { listPurchaseOrders } from '../../services/finance-lot3-service';
import { listConstructionSites, listSuppliers } from '../../services/finance-lot2-service';
import { INVOICING_STATE_LABELS, PURCHASE_ORDER_STATUS_LABELS } from '../../types/finance-lot3-types';
import type { PurchaseOrder, PurchaseOrderStatus } from '../../types/finance-lot3-types';
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

import { activeLocale } from '../../i18n/format';
/**
 * Bons de commande — liste filtrable, lot 3
 * (specs/018-finance-budget-pilotage/data-model.md §5,
 * `GET /tenants/{tenantId}/finance/purchase-orders`).
 *
 * Construit sur le modèle de `BalanceFournisseurs.tsx` et `Chantiers.tsx` :
 * l'état de liste (filtres) vit dans l'URL par `useListParams`, les trois
 * états sont délégués à `<DataView>`, et les options des filtres « Chantier »
 * et « Fournisseur » viennent de `listConstructionSites` / `listSuppliers`
 * (lot 2) plutôt que de la liste des bons elle-même — la liste ne porte que
 * des libellés, jamais un jeu d'identifiants complet.
 *
 * **Les filtres envoient un IDENTIFIANT, jamais un libellé.** C'est le défaut
 * relevé au lot 1 (un filtre par bien envoyait le nom du bien) : les deux
 * `<Select>` ci-dessous ont pour `value`/`onChange` l'identifiant
 * (`site.id`, `supplier.id`), jamais `site.name` ni `supplier.name` — seul
 * `label` porte le texte affiché à l'utilisateur.
 *
 * **Aucune pagination.** `PurchaseOrderFilters` ne documente ni `page` ni
 * `limit` (contrat gelé) : comme `Chantiers.tsx` et `BalanceFournisseurs.tsx`,
 * cet écran déclare `paginated={false}` plutôt que de laisser croire à une
 * pagination qui n'existe pas côté serveur.
 *
 * **Vocabulaire (P-1).** Le statut du bon (brouillon/émis/annulé) et son état
 * de facturation (non facturé/partiellement facturé/soldé) sont deux choses
 * distinctes (§4 du modèle) ; ni l'un ni l'autre ne prononce jamais « débit »
 * ni « crédit ».
 */

type Filters = { siteId: string; supplierId: string; status: string };
const FILTER_KEYS = ['siteId', 'supplierId', 'status'] as const;

function OPTIONS_STATUT() {
  return Object.entries(PURCHASE_ORDER_STATUS_LABELS()).map(([value, label]) => ({ value, label }));
}

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
  const list = useListParams<Filters>({ filterKeys: FILTER_KEYS });

  const filtresApi = {
    siteId: list.filters.siteId || undefined,
    supplierId: list.filters.supplierId || undefined,
    status: (list.filters.status || undefined) as PurchaseOrderStatus | undefined
  };

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('purchase-orders', tenantId, filtresApi),
    queryFn: () => listPurchaseOrders(tenantId as string, filtresApi),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const { data: chantiers } = useQuery({
    queryKey: queryKey('construction-sites', tenantId, {}),
    queryFn: () => listConstructionSites(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const { data: fournisseurs } = useQuery({
    queryKey: queryKey('suppliers', tenantId),
    queryFn: () => listSuppliers(tenantId as string),
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

  const optionsFournisseurs = useMemo(
    () =>
      (fournisseurs ?? [])
        .filter(f => f.isActive)
        .map(f => ({ value: f.id, label: f.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [fournisseurs]
  );

  const bons = data ?? [];
  const nombreFiltres = [list.filters.siteId, list.filters.supplierId, list.filters.status].filter(Boolean).length;

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const ouvrirBon = (bon: PurchaseOrder) => navigate(`/tenant/${tenantId}/finance/bons-de-commande/${bon.id}`);
  const ouvrirNouveauBon = () => navigate(`/tenant/${tenantId}/finance/bons-de-commande/nouveau`);

  const colonnes: ColumnsType<PurchaseOrder> = [
    { title: t('Référence'), key: 'reference', render: (_, b) => b.reference },
    { title: t('Chantier'), key: 'chantier', render: (_, b) => b.siteLabel },
    { title: t('Fournisseur'), key: 'fournisseur', render: (_, b) => b.supplierLabel },
    { title: t('Date'), key: 'date', render: (_, b) => dateCourte(b.orderDate) },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, b) => (
        <StatusTag status={b.status} tone={TONE_STATUT[b.status]} label={PURCHASE_ORDER_STATUS_LABELS()[b.status]} />
      )
    },
    {
      title: t('Facturation'),
      key: 'facturation',
      render: (_, b) => (
        <StatusTag
          status={b.invoicingState}
          tone={TONE_FACTURATION[b.invoicingState]}
          label={INVOICING_STATE_LABELS()[b.invoicingState]}
        />
      )
    },
    { title: t('Montant total'), key: 'montant', align: 'end', render: (_, b) => <MoneyValue value={b.totalAmount} /> },
    {
      title: t('Reste à facturer'),
      key: 'reste',
      align: 'end',
      render: (_, b) => <MoneyValue value={b.remainingAmount} />
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, b) => (
        <Button type="link" onClick={() => ouvrirBon(b)}>
          {t('Voir le détail')}
        </Button>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Bons de commande')}
        subtitle={bons.length > 0 ? `${bons.length} bon${bons.length > 1 ? 's' : ''}` : undefined}
        primaryAction={{ label: t('Nouveau bon'), icon: <PlusOutlined />, onClick: ouvrirNouveauBon }}
      />

      <FilterSheet
        activeCount={nombreFiltres}
        onClear={() => list.setFilters({ siteId: undefined, supplierId: undefined, status: undefined })}
        title={t('Filtrer les bons de commande')}
      >
        <div style={{ minWidth: 220 }}>
          <label htmlFor="filtre-bon-chantier">{t('Chantier')}</label>
          <Select
            id="filtre-bon-chantier"
            style={{ width: '100%' }}
            placeholder={t('Tous les chantiers')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={list.filters.siteId || undefined}
            onChange={valeur => list.setFilters({ siteId: valeur })}
            options={optionsChantiers}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="filtre-bon-fournisseur">{t('Fournisseur')}</label>
          <Select
            id="filtre-bon-fournisseur"
            style={{ width: '100%' }}
            placeholder={t('Tous les fournisseurs')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={list.filters.supplierId || undefined}
            onChange={valeur => list.setFilters({ supplierId: valeur })}
            options={optionsFournisseurs}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <label htmlFor="filtre-bon-statut">{t('Statut')}</label>
          <Select
            id="filtre-bon-statut"
            style={{ width: '100%' }}
            placeholder={t('Tous les statuts')}
            allowClear
            value={list.filters.status || undefined}
            onChange={valeur => list.setFilters({ status: valeur })}
            options={OPTIONS_STATUT()}
          />
        </div>
      </FilterSheet>

      <DataView<PurchaseOrder>
        paginated={false}
        scrollX={1080}
        items={bons}
        total={bons.length}
        page={1}
        pageSize={Math.max(bons.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger les bons de commande.') : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={() => list.setFilters({ siteId: undefined, supplierId: undefined, status: undefined })}
        emptyDescription={t("Aucun bon de commande n'est encore enregistré.")}
        emptyAction={{ label: t('Nouveau bon'), onClick: ouvrirNouveauBon }}
        columns={colonnes}
        rowKey={b => b.id}
        aria-label={t('Bons de commande')}
        renderCard={b => (
          <DataCard
            title={b.reference}
            aria-label={t('Bon {{reference}}', { reference: b.reference })}
            subtitle={`${b.siteLabel} · ${b.supplierLabel}`}
            status={
              <StatusTag
                status={b.status}
                tone={TONE_STATUT[b.status]}
                label={PURCHASE_ORDER_STATUS_LABELS()[b.status]}
              />
            }
            highlight={<MoneyValue value={b.totalAmount} />}
            fields={[
              { label: 'Date', value: dateCourte(b.orderDate) },
              {
                label: 'Facturation',
                value: (
                  <StatusTag
                    status={b.invoicingState}
                    tone={TONE_FACTURATION[b.invoicingState]}
                    label={INVOICING_STATE_LABELS()[b.invoicingState]}
                  />
                )
              },
              { label: t('Reste à facturer'), value: <MoneyValue value={b.remainingAmount} /> }
            ]}
            onOpen={() => ouvrirBon(b)}
          />
        )}
      />
    </>
  );
};

export default BonsDeCommande;
