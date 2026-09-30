import React from 'react';
import { useParams } from 'react-router-dom';
import { DatePicker } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { getAccountStatement, getAccountStatementPdfUrl } from '../../services/finance-service';
import type { ThirdPartyKind, ThirdPartyMovementLine, ThirdPartyMovementType } from '../../types/finance-types';
import { useListParams } from '../../hooks/useListParams';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, DataView, DataCard, FilterSheet } from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
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
  PAYMENT: t('Règlement'),
  ADVANCE_RECEIVED: t('Avance reçue'),
  ADVANCE_APPLIED: t('Avance imputée'),
  PENALTY: t('Pénalité'),
  WAIVER: 'Remise',
  ADJUSTMENT: 'Ajustement',
  OPENING_BALANCE: t('Solde initial'),
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

/**
 * Le vocabulaire dépend de QUI l'on parle.
 *
 * Cet écran servait celui des locataires à tout le monde : le relevé d'un
 * fournisseur annonçait « Loyer » devant chacune de ses factures, et
 * « Avance reçue » devant un acompte que l'agence avait elle-même versé. Le
 * fil d'Ariane, lui, disait « Clients ». L'écran du relevé client avait été
 * repris tel quel (relevé du 20 septembre 2026).
 *
 * Seules les natures dont le sens change d'un tiers à l'autre sont
 * surchargées : un règlement reste un règlement, une pénalité une pénalité.
 */
const NATURES_PAR_TIERS: Partial<Record<ThirdPartyKind, Partial<Record<ThirdPartyMovementType, string>>>> = {
  SUPPLIER: { INSTALLMENT: t('Facture'), ADVANCE_RECEIVED: t('Acompte versé') },
  EMPLOYEE: { INSTALLMENT: t('Note de salaire'), ADVANCE_RECEIVED: t('Avance versée') },
  CONTRACTOR: { INSTALLMENT: t("Situation d'avancement"), ADVANCE_RECEIVED: t('Acompte versé') },
  LANDLORD: { INSTALLMENT: t('Loyer de terrain'), ADVANCE_RECEIVED: t('Acompte versé') },
  PARTNER: { INSTALLMENT: t('Quote-part'), ADVANCE_RECEIVED: t('Acompte versé') }
};

function natureLabelDuTiers(type: ThirdPartyMovementLine['type'], kind?: ThirdPartyKind): string {
  if (kind && NATURES_PAR_TIERS[kind]?.[type]) {
    return NATURES_PAR_TIERS[kind][type] as string;
  }
  return natureLabel(type);
}

/**
 * Le fil d'Ariane mène là d'où l'on vient : la balance des clients pour un
 * locataire, celle des fournisseurs pour un fournisseur. Les tiers qui n'ont
 * pas d'écran de balance dédié portent leur nom sans lien, plutôt qu'un lien
 * qui mentirait.
 */
function filDAriane(kind: ThirdPartyKind | undefined, tenantId: string): { label: string; to?: string } {
  switch (kind) {
    case 'SUPPLIER':
      return { label: t('Fournisseurs'), to: `/tenant/${tenantId}/finance/fournisseurs/balance` };
    case 'EMPLOYEE':
      return { label: t('Salariés'), to: `/tenant/${tenantId}/finance/salaires` };
    case 'CONTRACTOR':
      return { label: t('Tâcherons'), to: `/tenant/${tenantId}/finance/tacherons` };
    case 'LANDLORD':
      return { label: t('Baux de terrain'), to: `/tenant/${tenantId}/finance/baux-terrain` };
    case 'PARTNER':
      return { label: t('Associations'), to: `/tenant/${tenantId}/finance/associations` };
    default:
      return { label: t('Clients'), to: `/tenant/${tenantId}/finance/balance-clients` };
  }
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
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
    return <StateBlock variant="empty" title={t('Aucun compte sélectionné')} />;
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
    { title: t('Date'), key: 'date', width: 120, render: (_, m) => dateCourte(m.movementDate) },
    { title: t('Nature'), key: 'nature', width: 160, render: (_, m) => natureLabelDuTiers(m.type, data?.kind) },
    { title: t('Libellé'), key: 'libelle', render: (_, m) => m.label },
    {
      title: t('Facturé'),
      key: 'facture',
      align: 'end',
      render: (_, m) => <MoneyValue value={m.amountBilled} />
    },
    {
      title: t('Réglé'),
      key: 'regle',
      align: 'end',
      render: (_, m) => <MoneyValue value={m.amountSettled} />
    },
    {
      title: t('Solde après'),
      key: 'solde',
      align: 'end',
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
        title={data?.label ?? t('Relevé de compte')}
        breadcrumbs={[
          { label: t('Finance'), to: `/tenant/${tenantId}/finance/balance-clients` },
          filDAriane(data?.kind, tenantId as string),
          { label: t('Relevé') }
        ]}
        subtitle={
          data ? (
            <>
              {t("Solde d'ouverture :")} <MoneyValue value={data.openingBalance} /> {t('· Solde de clôture :')}{' '}
              <MoneyValue value={data.closingBalance} />
            </>
          ) : undefined
        }
        primaryAction={{ label: t('Imprimer'), icon: <PrinterOutlined />, onClick: imprimer }}
      />

      <FilterSheet
        activeCount={[list.filters.from, list.filters.to].filter(Boolean).length}
        onClear={() => list.setFilters({ from: undefined, to: undefined })}
        title={t('Période du relevé')}
      >
        <div style={{ minWidth: 260 }}>
          <label htmlFor="periode-releve">{t('Période')}</label>
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
        error={erreurRequete ? t('Impossible de charger le relevé.') : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={() => list.setFilters({ from: undefined, to: undefined })}
        emptyDescription={t('Aucun mouvement sur cette période.')}
        columns={colonnes}
        rowKey={m => m.id}
        aria-label={t('Mouvements du relevé')}
        renderCard={m => (
          <DataCard
            title={natureLabelDuTiers(m.type, data?.kind)}
            subtitle={`${dateCourte(m.movementDate)} · ${m.label}`}
            highlight={<MoneyValue value={m.balanceAfter} />}
            fields={[
              { label: t('Facturé'), value: <MoneyValue value={m.amountBilled} /> },
              { label: t('Réglé'), value: <MoneyValue value={m.amountSettled} /> }
            ]}
          />
        )}
      />
    </>
  );
};

export default Releve;
