import React, { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, Select, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DataView, MoneyValue, StateBlock } from '../../../components/primitives';
import { useListParams } from '../../../hooks/useListParams';
import { getJournal } from '../../../services/accounting-exports-service';
import type { JournalEntry } from '../../../services/accounting-exports-service';
import { t } from '../../../i18n/t';
import {
  ACCOUNTING_PAGE_SIZE,
  AccountingFrame,
  ExportButtons,
  accountingQueryKey,
  dateCourte,
  useAccountingExport,
  useAccountingMeta,
  useAccountingPeriod
} from './shared';
import { EcritureLignes } from './journal/EcritureLignes';
import { FiltreTexte } from './journal/FiltreTexte';

const { Text } = Typography;

const FILTER_KEYS = ['journal', 'account', 'q'] as const;
type JournalFilters = { journal: string; account: string; q: string };
const MAX_PAGE_SIZE = 100;

/**
 * Journal des écritures : pagination serveur, une ligne par écriture, lignes
 * repliées par défaut. Disposition : `DataView` (tableau puis cartes sous
 * 992 px) ; le dépliage est local à chaque écriture, sans `expandable` ni
 * tableau imbriqué.
 */
export const JournalPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { from, to } = useAccountingPeriod();
  const { page, pageSize, filters, isFiltered, setFilters, clearFilters, setPage, setPageSize } =
    useListParams<JournalFilters>({ filterKeys: FILTER_KEYS, defaultPageSize: ACCOUNTING_PAGE_SIZE });
  const limit = Math.min(pageSize, MAX_PAGE_SIZE);
  const { journal = '', account = '', q = '' } = filters;

  const meta = useAccountingMeta(tenantId);
  const { exportEnCours, exporter } = useAccountingExport(tenantId);
  const [depliees, setDepliees] = useState<ReadonlySet<string>>(() => new Set());

  const query = useQuery({
    queryKey: accountingQueryKey('journal', tenantId, { from, to, page, limit, journal, account, q }),
    queryFn: () => getJournal(tenantId as string, { from, to, page, limit, journal, account, search: q }),
    enabled: Boolean(tenantId),
    placeholderData: keepPreviousData
  });
  const data = query.data;

  const basculer = useCallback((id: string) => {
    setDepliees(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const libelle = useCallback(
    (entry: JournalEntry) => {
      const ouverte = depliees.has(entry.id);
      return (
        <div>
          {entry.description}
          {entry.reversed && (
            <Tag color="orange" style={{ marginInlineStart: 'var(--space-2)' }}>
              {t('Contre-passée')}
            </Tag>
          )}
          <div>
            <Button
              type="link"
              size="small"
              style={{ paddingInline: 0 }}
              aria-expanded={ouverte}
              onClick={() => basculer(entry.id)}
            >
              {ouverte ? t('Masquer les lignes') : t('Voir les lignes')}
            </Button>
          </div>
          {ouverte && <EcritureLignes entry={entry} />}
        </div>
      );
    },
    [depliees, basculer]
  );

  const columns = useMemo<ColumnsType<JournalEntry>>(
    () => [
      { title: t('Date'), key: 'date', width: 120, render: (_, e) => dateCourte(e.date) },
      { title: t('Journal'), key: 'journal', width: 120, render: (_, e) => e.journalCode },
      { title: t('Référence'), key: 'reference', render: (_, e) => e.reference },
      { title: t('Libellé'), key: 'libelle', render: (_, e) => libelle(e) },
      { title: t('Débit'), key: 'debit', align: 'end', render: (_, e) => <MoneyValue value={e.debit} /> },
      { title: t('Crédit'), key: 'credit', align: 'end', render: (_, e) => <MoneyValue value={e.credit} /> }
    ],
    [libelle]
  );

  const renderCard = useCallback(
    (entry: JournalEntry) => (
      <Card size="small" style={{ marginBlockEnd: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          <Text strong>{entry.reference}</Text>
          <Text type="secondary">
            {dateCourte(entry.date)} · {entry.journalCode}
          </Text>
        </div>
        {libelle(entry)}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBlockStart: 'var(--space-2)' }}>
          <span>
            {t('Débit')} : <MoneyValue value={entry.debit} />
          </span>
          <span>
            {t('Crédit')} : <MoneyValue value={entry.credit} />
          </span>
        </div>
      </Card>
    ),
    [libelle]
  );

  if (!tenantId) return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;

  const exportParams = { from, to, journal, account, search: q };
  const options = (meta.data?.journals ?? []).map(j => ({ value: j.code, label: `${j.code} — ${j.label}` }));

  const filtres = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
      <div style={{ minWidth: 220 }}>
        <label htmlFor="comptabilite-filtre-journal">{t('Journal')}</label>
        <Select
          id="comptabilite-filtre-journal"
          style={{ width: '100%' }}
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t('Tous les journaux')}
          value={journal || undefined}
          onChange={valeur => setFilters({ journal: valeur })}
          options={options}
        />
      </div>
      <FiltreTexte
        id="comptabilite-filtre-compte"
        label={t('Compte')}
        placeholder={t('Numéro ou début de numéro')}
        value={account}
        onCommit={valeur => setFilters({ account: valeur })}
      />
      <FiltreTexte
        id="comptabilite-filtre-recherche"
        label={t('Rechercher')}
        placeholder={t('Libellé, pièce ou description')}
        value={q}
        onCommit={valeur => setFilters({ q: valeur })}
        width={300}
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
          onExport={format => exporter('journal', format, exportParams, `${t('Journal')}.${format}`)}
        />
      }
    >
      <DataView<JournalEntry>
        aria-label={t('Journal')}
        columns={columns}
        items={data?.items ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={limit}
        onPageChange={(nextPage, nextSize) => (nextSize !== limit ? setPageSize(nextSize) : setPage(nextPage))}
        loading={query.isPending}
        isReloading={query.isFetching && !query.isPending}
        error={query.isError ? t('Impossible de charger le journal.') : null}
        onRetry={() => void query.refetch()}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        emptyDescription={t('Aucune écriture sur cette période.')}
        renderCard={renderCard}
        rowKey={e => e.id}
        export={false}
      />
      {data && data.items.length > 0 && (
        <Text strong style={{ display: 'block', marginBlockStart: 'var(--space-3)' }}>
          {t('Total débit')} : <MoneyValue value={data.totals.debit} /> · {t('Total crédit')} :{' '}
          <MoneyValue value={data.totals.credit} />
        </Text>
      )}
    </AccountingFrame>
  );
};

export default JournalPage;
