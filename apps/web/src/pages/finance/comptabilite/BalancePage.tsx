import React, { useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Card, Checkbox, Select, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DataView, MoneyValue, StateBlock } from '../../../components/primitives';
import { useListParams } from '../../../hooks/useListParams';
import { getTrialBalance } from '../../../services/accounting-exports-service';
import type { TrialBalanceLine } from '../../../services/accounting-exports-service';
import { t } from '../../../i18n/t';
import { AccountingFrame, ExportButtons, accountingQueryKey, useAccountingExport, useAccountingPeriod } from './shared';
import { FiltreTexte } from './journal/FiltreTexte';

const { Text } = Typography;

const FILTER_KEYS = ['class', 'hideZero', 'q'] as const;
type BalanceFilters = { class: string; hideZero: string; q: string };
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
  const { page, pageSize, filters, isFiltered, setFilters, clearFilters, setPage, setPageSize } =
    useListParams<BalanceFilters>({ filterKeys: FILTER_KEYS, defaultPageSize: LOCAL_PAGE_SIZE });
  const size = Math.min(pageSize, LOCAL_PAGE_SIZE);
  const { class: accountClass = '', hideZero: soldes = '', q = '' } = filters;
  const hideZero = soldes === '1';

  const { exportEnCours, exporter } = useAccountingExport(tenantId);

  const query = useQuery({
    queryKey: accountingQueryKey('trial-balance', tenantId, { from, to, accountClass, hideZero, q }),
    queryFn: () =>
      getTrialBalance(tenantId as string, {
        from,
        to,
        accountClass: accountClass ? Number(accountClass) : undefined,
        hideZero: hideZero || undefined,
        search: q
      }),
    enabled: Boolean(tenantId),
    placeholderData: keepPreviousData
  });
  const data = query.data;

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

  const lines = data?.lines ?? [];
  const pages = Math.max(1, Math.ceil(lines.length / size));
  const pageCourante = Math.min(page, pages);
  const visibles = lines.slice((pageCourante - 1) * size, pageCourante * size);
  const exportParams = { from, to, class: accountClass, hideZero: hideZero ? 'true' : undefined, search: q };
  const totals = data?.totals;

  const filtres = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
      <div style={{ minWidth: 200 }}>
        <label htmlFor="comptabilite-filtre-classe">{t('Classe')}</label>
        <Select
          id="comptabilite-filtre-classe"
          style={{ width: '100%' }}
          allowClear
          placeholder={t('Toutes les classes')}
          value={accountClass || undefined}
          onChange={valeur => setFilters({ class: valeur })}
          options={[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ value: String(n), label: t('Classe {{n}}', { n }) }))}
        />
      </div>
      <FiltreTexte
        id="comptabilite-filtre-numero-intitule"
        label={t('Rechercher')}
        placeholder={t('Numéro ou intitulé')}
        value={q}
        onCommit={valeur => setFilters({ q: valeur })}
      />
      <Checkbox checked={hideZero} onChange={event => setFilters({ hideZero: event.target.checked ? '1' : undefined })}>
        {t('Masquer les comptes soldés')}
      </Checkbox>
    </div>
  );

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
        onPageChange={(nextPage, nextSize) => (nextSize !== size ? setPageSize(nextSize) : setPage(nextPage))}
        loading={query.isPending}
        isReloading={query.isFetching && !query.isPending}
        error={query.isError ? t('Impossible de charger la balance générale.') : null}
        onRetry={() => void query.refetch()}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
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
