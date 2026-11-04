import React, { useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Card, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DataView, ListSearch, MoneyValue, StateBlock } from '../../../components/primitives';
import { useListSearch } from '../../../hooks/useListSearch';
import { getTrialBalance } from '../../../services/accounting-exports-service';
import type { TrialBalanceLine } from '../../../services/accounting-exports-service';
import { t } from '../../../i18n/t';
import { AccountingFrame, ExportButtons, accountingQueryKey, useAccountingExport, useAccountingPeriod } from './shared';

const { Text } = Typography;

/** La réponse porte toutes les lignes : la pagination est locale, 100 comptes par page au plus. */
const LOCAL_PAGE_SIZE = 100;

/**
 * Balance générale : une ligne par compte, pagination locale, `DataView`
 * (tableau puis cartes sous 992 px). Le numéro de compte renvoie vers son
 * grand livre sur la même période.
 */
export const BalancePage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { from, to } = useAccountingPeriod();
  const search = useListSearch({
    defaultPageSize: LOCAL_PAGE_SIZE,
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Numéro ou intitulé') },
      {
        key: 'class',
        type: 'select',
        label: t('Classe'),
        primary: true,
        options: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ value: String(n), label: t('Classe {{n}}', { n }) }))
      },
      { key: 'hideZero', type: 'boolean', label: t('Masquer les comptes soldés'), primary: true }
    ]
  });
  const { page, filterParams } = search;
  const size = Math.min(search.pageSize, LOCAL_PAGE_SIZE);
  const classe = Number(filterParams.class);

  const { exportEnCours, exporter } = useAccountingExport(tenantId);

  // Le serveur filtre (recherche, classe, comptes soldés) : la réponse et ses totaux sont ceux du filtre.
  // Seule la pagination (100 comptes par page) est locale.
  const query = useQuery({
    queryKey: accountingQueryKey('trial-balance', tenantId, { from, to, ...filterParams }),
    queryFn: () =>
      getTrialBalance(tenantId as string, {
        from,
        to,
        accountClass: Number.isInteger(classe) && classe >= 1 && classe <= 9 ? classe : undefined,
        hideZero: filterParams.hideZero === 'true' || undefined,
        search: typeof filterParams.search === 'string' ? filterParams.search : undefined
      }),
    enabled: Boolean(tenantId),
    placeholderData: keepPreviousData
  });
  const data = query.data;
  const lines = useMemo(() => data?.lines ?? [], [data]);
  const pages = Math.max(1, Math.ceil(lines.length / size));
  const pageCourante = Math.min(page, pages);
  const visibles = useMemo(
    () => lines.slice((pageCourante - 1) * size, pageCourante * size),
    [lines, pageCourante, size]
  );

  const lienCompte = useCallback(
    (numero: string) => (
      <Link
        to={`/tenant/${tenantId}/finance/comptabilite/grand-livre?account=${encodeURIComponent(numero)}&from=${from}&to=${to}`}
      >
        {numero}
      </Link>
    ),
    [tenantId, from, to]
  );

  const columns = useMemo<ColumnsType<TrialBalanceLine>>(
    () => [
      { title: t('Compte'), key: 'compte', width: 120, render: (_, l) => lienCompte(l.accountNumber) },
      { title: t('Intitulé'), key: 'intitule', render: (_, l) => l.accountName },
      {
        title: t("Solde d'ouverture"),
        children: [
          {
            title: t('Débit'),
            key: 'ouvertureDebit',
            align: 'end',
            render: (_, l) => <MoneyValue value={l.openingDebit} />
          },
          {
            title: t('Crédit'),
            key: 'ouvertureCredit',
            align: 'end',
            render: (_, l) => <MoneyValue value={l.openingCredit} />
          }
        ]
      },
      {
        title: t('Mouvements de la période'),
        children: [
          {
            title: t('Débit'),
            key: 'mouvementsDebit',
            align: 'end',
            render: (_, l) => <MoneyValue value={l.periodDebit} />
          },
          {
            title: t('Crédit'),
            key: 'mouvementsCredit',
            align: 'end',
            render: (_, l) => <MoneyValue value={l.periodCredit} />
          }
        ]
      },
      {
        title: t('Solde de clôture'),
        children: [
          {
            title: t('Débit'),
            key: 'clotureDebit',
            align: 'end',
            render: (_, l) => <MoneyValue value={l.closingDebit} />
          },
          {
            title: t('Crédit'),
            key: 'clotureCredit',
            align: 'end',
            render: (_, l) => <MoneyValue value={l.closingCredit} />
          }
        ]
      }
    ],
    [lienCompte]
  );

  const renderCard = useCallback(
    (l: TrialBalanceLine) => (
      <Card size="small" style={{ marginBlockEnd: 'var(--space-3)' }}>
        <div style={{ fontWeight: 600 }}>
          {lienCompte(l.accountNumber)} — {l.accountName}
        </div>
        {(
          [
            [t("Solde d'ouverture"), l.openingDebit, l.openingCredit],
            [t('Mouvements de la période'), l.periodDebit, l.periodCredit],
            [t('Solde de clôture'), l.closingDebit, l.closingCredit]
          ] as const
        ).map(([titre, debit, credit]) => (
          <div key={titre} style={{ marginBlockStart: 'var(--space-2)' }}>
            <Text type="secondary">{titre}</Text>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>
                {t('Débit')} : <MoneyValue value={debit} />
              </span>
              <span>
                {t('Crédit')} : <MoneyValue value={credit} />
              </span>
            </div>
          </div>
        ))}
      </Card>
    ),
    [lienCompte]
  );

  if (!tenantId) return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;

  // Mêmes filtres que la liste (class, hideZero, search) ; la période vient du cadre commun.
  const exportParams = { from, to, ...filterParams };
  const totals = data?.totals;

  const filtres = <ListSearch {...search.searchProps} resultCount={lines.length} />;

  return (
    <AccountingFrame
      sync={data?.sync}
      filters={filtres}
      actions={
        <ExportButtons
          loadingKey={exportEnCours}
          onExport={format => exporter('trial-balance', format, exportParams, `${t('Balance générale')}.${format}`)}
        />
      }
    >
      {data && !data.isBalanced && (
        <Alert
          type="error"
          showIcon
          message={t("La balance n'est pas équilibrée : signalez-le à l'éditeur.")}
          style={{ marginBlockEnd: 'var(--space-4)' }}
        />
      )}

      <DataView<TrialBalanceLine>
        aria-label={t('Balance générale')}
        columns={columns}
        items={visibles}
        total={lines.length}
        page={pageCourante}
        pageSize={size}
        onPageChange={(nextPage, nextSize) =>
          nextSize !== size ? search.setPageSize(nextSize) : search.setPage(nextPage)
        }
        loading={query.isPending}
        isReloading={query.isFetching && !query.isPending}
        error={query.isError ? t('Impossible de charger la balance générale.') : null}
        onRetry={() => void query.refetch()}
        isFiltered={search.isFiltered}
        onClearFilters={search.clear}
        emptyDescription={t('Aucune ligne dans la balance générale.')}
        renderCard={renderCard}
        rowKey={l => l.accountNumber}
        scrollX={900}
        export={false}
      />

      {totals && lines.length > 0 && (
        <div
          role="group"
          aria-label={t('Total')}
          style={{ marginBlockStart: 'var(--space-3)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}
        >
          <Text strong>{t('Total')}</Text>
          {(
            [
              [t("Solde d'ouverture"), totals.openingDebit, totals.openingCredit],
              [t('Mouvements de la période'), totals.periodDebit, totals.periodCredit],
              [t('Solde de clôture'), totals.closingDebit, totals.closingCredit]
            ] as const
          ).map(([titre, debit, credit]) => (
            <Text key={titre} strong>
              {titre} : {t('Débit')} <MoneyValue value={debit} /> · {t('Crédit')} <MoneyValue value={credit} />
            </Text>
          ))}
        </div>
      )}
    </AccountingFrame>
  );
};

export default BalancePage;
