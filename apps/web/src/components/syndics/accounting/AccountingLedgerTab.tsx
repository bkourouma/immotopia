import React, { useMemo } from 'react';
import { Alert, Button, Col, Empty, Row, Space } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { MoneyValue, StatCard, Table } from '../../primitives';
import { getAccountLedger, type SyndicLedgerLine, type SyndicLedgerQuery } from '../../../services/syndic-service';
import { useListSearch } from '../../../hooks/useListSearch';
import { collectAllPages } from '../../../utils/table-export/collect';
import { t } from '../../../i18n/t';
import { AccountSelect } from './AccountSelect';
import { AccountingTabProps, LEDGER_PAGE_SIZE, LEDGER_PREFIX, accountLabel, accountingKey } from './accounting-shared';

/**
 * Grand livre d'UN compte : sans compte choisi, aucune requête n'est envoyée.
 * Le compte (obligatoire) est un sélecteur d'écran, pas un critère ; la barre porte la recherche
 * (pièce, description, libellé) et la période, sous le préfixe `gl`.
 */
export const AccountingLedgerTab: React.FC<AccountingTabProps> = ({
  tenantId,
  syndicId,
  params,
  updateParams,
  accounts
}) => {
  const accountId = params.get('accountId') || undefined;

  const search = useListSearch({
    paramPrefix: LEDGER_PREFIX,
    ariaLabel: t('Rechercher dans le grand livre'),
    defaultPageSize: LEDGER_PAGE_SIZE,
    apiNames: { sort: false },
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Pièce, description, libellé de ligne…')
      },
      {
        key: 'period',
        type: 'dateRange',
        label: t('Période'),
        primary: true,
        api: ['from', 'to']
      }
    ]
  });

  const {
    data: ledger,
    isLoading,
    isFetching,
    error
  } = useQuery({
    queryKey: accountingKey(tenantId, syndicId, 'grand-livre', { accountId, ...search.apiParams }),
    queryFn: () =>
      getAccountLedger(tenantId, syndicId, {
        ...search.apiParams,
        accountId: accountId as string
      } as unknown as SyndicLedgerQuery),
    enabled: Boolean(accountId),
    placeholderData: keepPreviousData
  });

  // Précédent / suivant suivent l'ordre du plan comptable déjà chargé (numéro de compte croissant).
  const ordered = useMemo(
    () => [...accounts].sort((a, b) => a.accountNumber.localeCompare(b.accountNumber, undefined, { numeric: true })),
    [accounts]
  );
  const index = accountId ? ordered.findIndex(account => account.id === accountId) : -1;
  const previous = index > 0 ? ordered[index - 1] : undefined;
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : undefined;

  const selectAccount = (id: string | undefined) =>
    updateParams({ accountId: id, [`${LEDGER_PREFIX}.page`]: undefined });

  // Le libellé vient de la réponse du serveur, pour rester affiché hors des 20 résultats de recherche.
  const known = accounts.find(account => account.id === accountId);
  const selectedLabel =
    ledger && ledger.account.id === accountId ? accountLabel(ledger.account) : known ? accountLabel(known) : undefined;

  const columns = useMemo(
    () => [
      {
        title: t('Date'),
        dataIndex: 'entryDate',
        render: (value: string) => dayjs(value).format('DD/MM/YYYY')
      },
      { title: t('Pièce'), dataIndex: 'reference' },
      { title: t('Journal'), dataIndex: 'journalCode', render: (value: string | null) => value || '-' },
      { title: t('Libellé'), render: (_: unknown, line: SyndicLedgerLine) => line.label || line.description },
      { title: t('Lot'), dataIndex: 'lotNumber', render: (value: string | null) => value || '-' },
      {
        title: t('Débit'),
        dataIndex: 'debit',
        align: 'end' as const,
        render: (value: number) => <MoneyValue value={value} />
      },
      {
        title: t('Crédit'),
        dataIndex: 'credit',
        align: 'end' as const,
        render: (value: number) => <MoneyValue value={value} />
      },
      {
        title: t('Solde progressif'),
        dataIndex: 'runningBalance',
        align: 'end' as const,
        render: (value: number) => <MoneyValue value={value} />
      }
    ],
    []
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap>
        <Button
          icon={<LeftOutlined />}
          aria-label={t('Compte précédent')}
          disabled={!previous}
          onClick={() => previous && selectAccount(previous.id)}
        />
        <AccountSelect
          tenantId={tenantId}
          syndicId={syndicId}
          accounts={accounts}
          value={accountId}
          selectedLabel={selectedLabel}
          allowClear
          placeholder={t('Choisissez un compte')}
          ariaLabel={t('Compte')}
          onChange={selectAccount}
        />
        <Button
          icon={<RightOutlined />}
          aria-label={t('Compte suivant')}
          disabled={!next}
          onClick={() => next && selectAccount(next.id)}
        />
      </Space>

      {!accountId ? (
        <Empty description={t('Choisissez un compte pour afficher son grand livre.')} />
      ) : (
        <>
          {error ? <Alert type="error" showIcon message={t('Impossible de charger la comptabilité')} /> : null}
          {ledger ? (
            <Row gutter={[16, 16]}>
              <Col xs={24} md={6}>
                <StatCard label={t("Solde d'ouverture")} value={<MoneyValue value={ledger.summary.openingBalance} />} />
              </Col>
              <Col xs={24} md={6}>
                <StatCard label={t('Total débit')} value={<MoneyValue value={ledger.summary.periodDebit} />} />
              </Col>
              <Col xs={24} md={6}>
                <StatCard label={t('Total crédit')} value={<MoneyValue value={ledger.summary.periodCredit} />} />
              </Col>
              <Col xs={24} md={6}>
                <StatCard label={t('Solde de clôture')} value={<MoneyValue value={ledger.summary.closingBalance} />} />
              </Col>
            </Row>
          ) : null}
          <Table<SyndicLedgerLine>
            helpId="syndic.comptabilite.grand-livre"
            search={search.searchProps}
            exportFilename={t('Grand livre')}
            exportFetchAll={() =>
              collectAllPages<SyndicLedgerLine>(async (exportPage, limit) => {
                const result = await getAccountLedger(tenantId, syndicId, {
                  ...search.filterParams,
                  accountId,
                  page: exportPage,
                  limit
                } as unknown as SyndicLedgerQuery);
                return { items: result.items, total: result.pagination.total };
              })
            }
            scroll={{ x: 'max-content' }}
            rowKey="id"
            loading={isLoading || isFetching}
            dataSource={ledger?.items ?? []}
            columns={columns}
            pagination={search.tablePagination(ledger?.pagination.total ?? 0)}
            locale={search.isFiltered ? undefined : { emptyText: t('Aucune ligne pour ce compte.') }}
          />
        </>
      )}
    </Space>
  );
};
