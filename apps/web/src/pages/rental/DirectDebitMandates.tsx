import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listCreditors, listMandates, MandateDto, MandateListFilters } from '../../services/direct-debit-service';
import { PageHeader, Table, formatMoney } from '../../components/primitives';
import {
  apiErrorMessage,
  formatDate,
  MANDATE_STATUSES,
  mandateStatusLabel,
  MandateStatusTag
} from '../../components/rental/direct-debit/direct-debit-shared';
import { DirectDebitTabs } from '../../components/rental/direct-debit/DirectDebitTabs';
import { useListSearch } from '../../hooks/useListSearch';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { collectAllPages } from '../../utils/table-export/collect';
import { t } from '../../i18n/t';

/**
 * Location › Prélèvements (spec 042, PB2) : tous les mandats de l'agence.
 * Les actions (activer, suspendre, révoquer…) se font depuis l'onglet
 * « Prélèvements » du bail, que chaque ligne ouvre.
 *
 * Recherche multicritères paginée par le serveur (guide recherche-listes.md) :
 * `?q=…&status=ACTIVE&creditorId=…&signedFrom=…&page=2`. L'API nomme la taille
 * de page `pageSize` et ne trie pas.
 */
export const DirectDebitMandates: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();

  // Créanciers de l'agence : liste courte (quelques lignes), chargée une fois.
  const { data: creditors = [] } = useQuery({
    queryKey: queryKey('direct-debit-creditors', tenantId),
    queryFn: () => listCreditors(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const search = useListSearch({
    apiNames: { limit: 'pageSize', sort: false },
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Référence, débiteur, titulaire, bail…')
      },
      {
        key: 'status',
        type: 'select',
        label: t('Statut'),
        primary: true,
        options: MANDATE_STATUSES.map(value => ({ value, label: mandateStatusLabel(value) }))
      },
      {
        key: 'creditorId',
        type: 'select',
        label: t('Créancier'),
        primary: true,
        options: creditors.map(creditor => ({ value: creditor.id, label: creditor.label }))
      },
      {
        key: 'signed',
        type: 'dateRange',
        label: t('Signé le'),
        api: ['signedFrom', 'signedTo']
      }
    ]
  });

  const { data, isFetching, error } = useQuery({
    queryKey: queryKey('direct-debit-mandates', tenantId, search.apiParams),
    queryFn: () => listMandates(tenantId as string, search.apiParams as MandateListFilters),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });
  const total = data?.total ?? 0;

  const columns: ColumnsType<MandateDto> = [
    { title: t('Référence'), dataIndex: 'reference', key: 'reference' },
    { title: t('Statut'), key: 'status', render: (_value, mandate) => <MandateStatusTag status={mandate.status} /> },
    { title: t('Débiteur'), key: 'debtor', render: (_value, mandate) => mandate.debtor.displayName ?? '—' },
    {
      title: t('Bail'),
      key: 'lease',
      render: (_value, mandate) =>
        mandate.lease ? (
          <Link to={`/tenant/${tenantId}/rental/leases/${mandate.lease.id}`}>{mandate.lease.leaseNumber}</Link>
        ) : (
          '—'
        )
    },
    {
      title: t('IBAN'),
      dataIndex: 'ibanMasked',
      key: 'iban',
      render: (value: string) => <bdi dir="ltr">{value}</bdi>
    },
    { title: t('Code banque'), dataIndex: 'bankCode', key: 'bankCode' },
    { title: t('Titulaire'), dataIndex: 'holderName', key: 'holder' },
    { title: t('Créancier'), key: 'creditor', render: (_value, mandate) => mandate.creditor.label },
    {
      title: t('Plafond'),
      key: 'maxAmount',
      render: (_value, mandate) => (mandate.maxAmount != null ? formatMoney(mandate.maxAmount) : '—')
    },
    { title: t('Jour de collecte'), dataIndex: 'effectiveCollectionDay', key: 'day' },
    { title: t('Signé le'), key: 'signedAt', render: (_value, mandate) => formatDate(mandate.signedAt) },
    { title: t('Rejets consécutifs'), dataIndex: 'consecutiveRejects', key: 'rejects' }
  ];

  return (
    <>
      <PageHeader title={t('Prélèvements')} subtitle={data ? `${data.total}` : undefined} />
      <DirectDebitTabs />
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {error && (
          <Alert type="error" showIcon message={apiErrorMessage(error, t('Erreur lors du chargement des mandats'))} />
        )}
        <Table<MandateDto>
          helpId="locatif.prelevements.mandats.tableau"
          aria-label={t('Mandats de prélèvement')}
          rowKey="id"
          size="middle"
          search={search.searchProps}
          exportFilename={t('Mandats de prélèvement')}
          exportFetchAll={() =>
            collectAllPages<MandateDto>(async (page, limit) => {
              const response = await listMandates(tenantId as string, {
                ...(search.filterParams as MandateListFilters),
                page,
                pageSize: limit
              });
              return { items: response.items, total: response.total };
            })
          }
          loading={isFetching}
          columns={columns}
          dataSource={data?.items ?? []}
          scroll={{ x: 'max-content' }}
          pagination={search.tablePagination(total)}
          // Sous critère, la Table affiche seule son bloc « Aucun résultat » + « Effacer les critères ».
          locale={search.isFiltered ? undefined : { emptyText: t('Aucun mandat de prélèvement') }}
        />
      </Space>
    </>
  );
};
