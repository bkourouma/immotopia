import React, { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Card, DatePicker, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DataView, MoneyValue, StateBlock } from '../../../../components/primitives';
import { useListParams } from '../../../../hooks/useListParams';
import { getMandantTrialBalance, UNASSIGNED_OWNER } from '../../../../services/accounting-exports-service';
import type { MandantTrialBalanceRow } from '../../../../services/accounting-exports-service';
import { t } from '../../../../i18n/t';
import { AccountingFrame, ExportButtons, accountingQueryKey, useAccountingExport } from '../shared';
import { FiltreTexte } from '../journal/FiltreTexte';
import { ControleMandants } from './ControleMandants';
import { SelecteurVue } from './SelecteurVue';
import { LIMITE_PROPRIETAIRES, useMandantUrl } from './useMandantUrl';

const { Text } = Typography;

type MandantFilters = { q: string };
const FILTER_KEYS = ['q'] as const;
const MAX_PAGE_SIZE = 100;
const ISO = 'YYYY-MM-DD';

const libelleProprietaire = (row: MandantTrialBalanceRow) =>
  row.ownerKey === UNASSIGNED_OWNER ? t('Non réparti') : row.ownerLabel;

/**
 * Balance auxiliaire des mandants à une date d'arrêté (`date-mandants`, par
 * défaut la fin de la période) : un solde par propriétaire et par nature,
 * paginé par le serveur, avec le contrôle contre le solde général du compte.
 */
export const BalanceAuxiliaire: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { vue, dateArrete, maj } = useMandantUrl();
  const { page, pageSize, filters, isFiltered, setFilters, clearFilters, setPage, setPageSize } =
    useListParams<MandantFilters>({ filterKeys: FILTER_KEYS, defaultPageSize: LIMITE_PROPRIETAIRES });
  const limit = Math.min(pageSize, MAX_PAGE_SIZE);
  const { q = '' } = filters;
  const { exportEnCours, exporter } = useAccountingExport(tenantId);

  const query = useQuery({
    queryKey: accountingQueryKey('mandant-trial-balance', tenantId, { date: dateArrete, page, limit, search: q }),
    queryFn: () => getMandantTrialBalance(tenantId as string, { date: dateArrete, page, limit, search: q }),
    enabled: Boolean(tenantId),
    placeholderData: keepPreviousData
  });
  const data = query.data;

  const columns = useMemo<ColumnsType<MandantTrialBalanceRow>>(
    () => [
      { title: t('Mandant'), key: 'mandant', render: (_, r) => libelleProprietaire(r) },
      {
        title: t('Compte courant'),
        key: 'courant',
        align: 'end',
        render: (_, r) => <MoneyValue value={r.current} signed />
      },
      {
        title: t('Dépôt de garantie'),
        key: 'depot',
        align: 'end',
        render: (_, r) => <MoneyValue value={r.deposit} signed />
      },
      {
        title: t('À affecter'),
        key: 'affecter',
        align: 'end',
        render: (_, r) => <MoneyValue value={r.unallocated} signed />
      },
      { title: t('Total'), key: 'total', align: 'end', render: (_, r) => <MoneyValue value={r.total} signed /> }
    ],
    []
  );

  const renderCard = useCallback(
    (r: MandantTrialBalanceRow) => (
      <Card size="small" style={{ marginBlockEnd: 'var(--space-3)' }}>
        <Text strong>{libelleProprietaire(r)}</Text>
        <div>
          {t('Compte courant')} : <MoneyValue value={r.current} signed />
        </div>
        <div>
          {t('Dépôt de garantie')} : <MoneyValue value={r.deposit} signed />
        </div>
        <div>
          {t('À affecter')} : <MoneyValue value={r.unallocated} signed />
        </div>
        <div>
          <Text strong>
            {t('Total')} : <MoneyValue value={r.total} signed />
          </Text>
        </div>
      </Card>
    ),
    []
  );

  if (!tenantId) return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;

  const filtres = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
      <SelecteurVue vue={vue} maj={maj} />
      <div>
        <div>
          <label htmlFor="comptabilite-mandants-date">{t('Date d’arrêté')}</label>
        </div>
        <DatePicker
          id="comptabilite-mandants-date"
          format="DD/MM/YYYY"
          value={dayjs(dateArrete)}
          onChange={date => date && maj({ 'date-mandants': date.format(ISO), page: undefined })}
          allowClear={false}
        />
      </div>
      <FiltreTexte
        id="comptabilite-mandants-recherche"
        label={t('Rechercher')}
        placeholder={t('Nom du mandant')}
        value={q}
        onCommit={valeur => setFilters({ q: valeur })}
      />
    </div>
  );

  return (
    <AccountingFrame
      sync={data?.sync}
      filters={filtres}
      actions={
        <ExportButtons
          loadingKey={exportEnCours}
          onExport={format =>
            exporter(
              'mandant-trial-balance',
              format,
              { date: dateArrete, search: q || undefined },
              `${t('Balance auxiliaire des mandants')}.${format}`
            )
          }
        />
      }
    >
      <ControleMandants
        control={data?.control}
        accountNumber={data?.accountNumber}
        message={t(
          "La balance auxiliaire des mandants ne coïncide pas avec le solde général du compte : signalez-le à l'éditeur."
        )}
      />
      <DataView<MandantTrialBalanceRow>
        aria-label={t('Balance auxiliaire des mandants')}
        columns={columns}
        items={data?.items ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={limit}
        onPageChange={(nextPage, nextSize) => (nextSize !== limit ? setPageSize(nextSize) : setPage(nextPage))}
        loading={query.isPending}
        isReloading={query.isFetching && !query.isPending}
        error={query.isError ? t('Impossible de charger la balance auxiliaire des mandants.') : null}
        onRetry={() => void query.refetch()}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        emptyDescription={t('Aucun solde de mandant à cette date.')}
        renderCard={renderCard}
        rowKey={r => r.ownerKey}
        export={false}
      />
      {data && data.items.length > 0 && (
        <div
          data-testid="totaux-balance-mandants"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', marginBlockStart: 'var(--space-3)' }}
        >
          <Text strong>{t('Total')}</Text>
          <Text strong>
            {t('Compte courant')} : <MoneyValue value={data.totals.current} signed />
          </Text>
          <Text strong>
            {t('Dépôt de garantie')} : <MoneyValue value={data.totals.deposit} signed />
          </Text>
          <Text strong>
            {t('À affecter')} : <MoneyValue value={data.totals.unallocated} signed />
          </Text>
          <Text strong>
            {t('Total')} : <MoneyValue value={data.totals.total} signed />
          </Text>
        </div>
      )}
    </AccountingFrame>
  );
};

export default BalanceAuxiliaire;
