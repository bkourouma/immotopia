import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DataView, ListSearch, MoneyValue, StateBlock } from '../../../components/primitives';
import { useListSearch } from '../../../hooks/useListSearch';
import { getJournal } from '../../../services/accounting-exports-service';
import type { JournalEntry } from '../../../services/accounting-exports-service';
import { t } from '../../../i18n/t';
import { helpAnchor } from '../../../help';
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
  const meta = useAccountingMeta(tenantId);
  const journaux = meta.data?.journals;

  const search = useListSearch({
    defaultPageSize: ACCOUNTING_PAGE_SIZE,
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Libellé, pièce ou description') },
      {
        key: 'journal',
        type: 'select',
        label: t('Journal'),
        primary: true,
        // Options statiques arrivées après le premier rendu : la barre les suit (signature d'affichage du hook).
        options: (journaux ?? []).map(j => ({ value: j.code, label: `${j.code} — ${j.label}` }))
      },
      // Numéro ou début de numéro : saisie libre, portée par le hook (URL, effacement, API)
      // mais rendue hors des contrôles de la barre (voir `compteField`).
      { key: 'account', type: 'select', label: t('Compte') }
    ]
  });
  const { page, filterParams } = search;
  const limit = Math.min(search.pageSize, MAX_PAGE_SIZE);

  const { exportEnCours, exporter } = useAccountingExport(tenantId);
  const [depliees, setDepliees] = useState<ReadonlySet<string>>(() => new Set());

  const query = useQuery({
    queryKey: accountingQueryKey('journal', tenantId, { from, to, page, limit, ...filterParams }),
    queryFn: () => getJournal(tenantId as string, { from, to, page, limit, ...filterParams }),
    enabled: Boolean(tenantId),
    placeholderData: keepPreviousData
  });
  const data = query.data;

  // Lien partagé hors bornes (`?page=9` pour 3 pages) : la barre est montée à part, donc le recadrage
  // automatique de `DataView` ne joue pas. On recadre une fois la vraie réponse reçue (jamais sur la précédente).
  const totalEcritures = query.isPlaceholderData ? undefined : data?.total;
  const { clampPage } = search;
  useEffect(() => {
    if (totalEcritures !== undefined) clampPage?.(totalEcritures);
  }, [totalEcritures, clampPage]);

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

  // Mêmes filtres que la liste, sans page (la période vient du cadre commun).
  const exportParams = { from, to, ...filterParams };

  // `account` n'est pas un contrôle de la barre : aucun type de critère ne convient à une
  // seconde saisie libre (un seul `text` par barre). Elle se loge à l'extrémité de la ligne.
  const criteresBarre = search.searchProps.criteria.filter(c => c.key !== 'account');
  const compteField = (
    <FiltreTexte
      id="comptabilite-filtre-compte"
      label={t('Compte')}
      placeholder={t('Numéro ou début de numéro')}
      value={typeof search.values.account === 'string' ? search.values.account : ''}
      onCommit={valeur => search.setValues({ account: valeur })}
    />
  );

  const filtres = (
    <ListSearch {...search.searchProps} criteria={criteresBarre} resultCount={data?.total} extra={compteField} />
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
      <div {...helpAnchor('journal-tableau')}>
        <DataView<JournalEntry>
          helpId="finance.journal.tableau"
          aria-label={t('Journal')}
          columns={columns}
          items={data?.items ?? []}
          total={data?.total ?? 0}
          page={page}
          pageSize={limit}
          onPageChange={(nextPage, nextSize) =>
            nextSize !== limit ? search.setPageSize(nextSize) : search.setPage(nextPage)
          }
          loading={query.isPending}
          isReloading={query.isFetching && !query.isPending}
          error={query.isError ? t('Impossible de charger le journal.') : null}
          onRetry={() => void query.refetch()}
          isFiltered={search.isFiltered}
          onClearFilters={search.clear}
          emptyDescription={t('Aucune écriture sur cette période.')}
          renderCard={renderCard}
          rowKey={e => e.id}
          export={false}
        />
      </div>
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
