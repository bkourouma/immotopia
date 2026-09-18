import React from 'react';
import { useParams } from 'react-router-dom';
import { DatePicker } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { getAccountStatement, getAccountStatementPdfUrl } from '../../services/finance-service';
import type { ThirdPartyMovementLine, ThirdPartyMovementType } from '../../types/finance-types';
import { useListParams } from '../../hooks/useListParams';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, DataView, DataCard, FilterSheet } from '../../components/primitives';

const { RangePicker } = DatePicker;

/**
 * Relevé de compte de tiers — Récit 2 du spec, tâche 1.13 du plan.
 *
 * Une chronologie, pas une liste : une ligne par pièce (échéance, règlement,
 * avance, pénalité…), le solde après chaque ligne — déjà calculé côté
 * serveur, jamais recalculé ici — et un en-tête portant le solde d'ouverture
 * et de clôture. Modelé sur `pages/rental/Payments.tsx` et
 * `pages/rental/InstallmentDetailPage.tsx`, les deux écrans hybrides de
 * référence du dépôt.
 *
 * **Principe P-1** : ni « débit » ni « crédit » à l'écran. Les en-têtes
 * disent « Facturé » / « Réglé », et la nature de chaque mouvement se lit en
 * français par `natureLabel` — jamais le code brut de l'énumération.
 */

/** Nature d'un mouvement -> libellé français, prêt à afficher (P-1). */
export const NATURE_LABELS: Record<ThirdPartyMovementType, string> = {
  INSTALLMENT: 'Loyer',
  PAYMENT: 'Règlement',
  ADVANCE_RECEIVED: 'Avance reçue',
  ADVANCE_APPLIED: 'Avance imputée',
  PENALTY: 'Pénalité',
  WAIVER: 'Remise',
  ADJUSTMENT: 'Ajustement',
  OPENING_BALANCE: 'Solde initial',
  VOID: 'Annulation'
};

/**
 * Libellé lisible d'une nature de mouvement.
 *
 * Un code qui échapperait à la table s'affiche tel quel plutôt que de
 * disparaître — mais chaque valeur de `ThirdPartyMovementType` y figure déjà,
 * TypeScript l'exige via `Record<ThirdPartyMovementType, string>` ci-dessus.
 */
export function natureLabel(type: ThirdPartyMovementLine['type']): string {
  return NATURE_LABELS[type] ?? type;
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

type Filters = { from: string; to: string };
const FILTER_KEYS = ['from', 'to'] as const;

export const Releve: React.FC = () => {
  const { tenantId, accountId } = useParams<{ tenantId: string; accountId: string }>();
  const list = useListParams<Filters>({ filterKeys: FILTER_KEYS });

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('account-statement', tenantId, {
      accountId: accountId ?? '',
      from: list.filters.from ?? '',
      to: list.filters.to ?? ''
    }),
    queryFn: () =>
      getAccountStatement(tenantId as string, accountId as string, {
        from: list.filters.from || undefined,
        to: list.filters.to || undefined
      }),
    enabled: Boolean(tenantId && accountId),
    staleTime: STALE_TIME.list
  });

  if (!tenantId || !accountId) {
    return <StateBlock variant="empty" title="Aucun compte sélectionné" />;
  }

  const mouvements = data?.movements ?? [];

  const plage: [Dayjs, Dayjs] | null =
    list.filters.from && list.filters.to ? [dayjs(list.filters.from), dayjs(list.filters.to)] : null;

  const imprimer = () => {
    const url = getAccountStatementPdfUrl(tenantId, accountId, {
      from: list.filters.from || undefined,
      to: list.filters.to || undefined
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const colonnes: ColumnsType<ThirdPartyMovementLine> = [
    { title: 'Date', key: 'date', width: 120, render: (_, m) => dateCourte(m.movementDate) },
    { title: 'Nature', key: 'nature', width: 160, render: (_, m) => natureLabel(m.type) },
    { title: 'Libellé', key: 'libelle', render: (_, m) => m.label },
    {
      title: 'Facturé',
      key: 'facture',
      align: 'right',
      render: (_, m) => <MoneyValue value={m.amountBilled} />
    },
    {
      title: 'Réglé',
      key: 'regle',
      align: 'right',
      render: (_, m) => <MoneyValue value={m.amountSettled} />
    },
    {
      title: 'Solde après',
      key: 'solde',
      align: 'right',
      render: (_, m) => (
        <strong>
          <MoneyValue value={m.balanceAfter} />
        </strong>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={data?.label ?? 'Relevé de compte'}
        breadcrumbs={[
          { label: 'Finance', to: `/tenant/${tenantId}/finance/clients` },
          { label: 'Clients', to: `/tenant/${tenantId}/finance/clients` },
          { label: 'Relevé' }
        ]}
        subtitle={
          data ? (
            <>
              Solde d'ouverture : <MoneyValue value={data.openingBalance} /> · Solde de clôture :{' '}
              <MoneyValue value={data.closingBalance} />
            </>
          ) : undefined
        }
        primaryAction={{ label: 'Imprimer', icon: <PrinterOutlined />, onClick: imprimer }}
      />

      <FilterSheet
        activeCount={[list.filters.from, list.filters.to].filter(Boolean).length}
        onClear={() => list.setFilters({ from: undefined, to: undefined })}
        title="Période du relevé"
      >
        <div style={{ minWidth: 260 }}>
          <label htmlFor="periode-releve">Période</label>
          <RangePicker
            id="periode-releve"
            style={{ width: '100%' }}
            value={plage}
            format="DD/MM/YYYY"
            onChange={dates => {
              if (dates && dates[0] && dates[1]) {
                list.setFilters({ from: dates[0].format('YYYY-MM-DD'), to: dates[1].format('YYYY-MM-DD') });
              } else {
                list.setFilters({ from: undefined, to: undefined });
              }
            }}
          />
        </div>
      </FilterSheet>

      <DataView<ThirdPartyMovementLine>
        // Une chronologie se lit d'un bloc : pas de pagination, le serveur
        // rend déjà le relevé borné par les dates choisies.
        paginated={false}
        scrollX={960}
        items={mouvements}
        total={mouvements.length}
        page={1}
        pageSize={mouvements.length || 20}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? 'Impossible de charger le relevé.' : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={() => list.setFilters({ from: undefined, to: undefined })}
        emptyDescription="Aucun mouvement sur cette période."
        columns={colonnes}
        rowKey={m => m.id}
        aria-label="Mouvements du relevé"
        renderCard={m => (
          <DataCard
            title={natureLabel(m.type)}
            subtitle={`${dateCourte(m.movementDate)} · ${m.label}`}
            highlight={<MoneyValue value={m.balanceAfter} />}
            fields={[
              { label: 'Facturé', value: <MoneyValue value={m.amountBilled} /> },
              { label: 'Réglé', value: <MoneyValue value={m.amountSettled} /> }
            ]}
          />
        )}
      />
    </>
  );
};

export default Releve;
