import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Input, Select, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { listCreditors, listMandates, MandateDto, MandateStatus } from '../../services/direct-debit-service';
import { PageHeader, formatMoney } from '../../components/primitives';
import {
  apiErrorMessage,
  formatDate,
  MANDATE_STATUSES,
  mandateStatusLabel,
  MandateStatusTag
} from '../../components/rental/direct-debit/direct-debit-shared';
import { DirectDebitTabs } from '../../components/rental/direct-debit/DirectDebitTabs';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { t } from '../../i18n/t';

const PAGE_SIZE = 20;

/**
 * Location › Prélèvements (spec 042, PB2) : tous les mandats de l'agence.
 * Les actions (activer, suspendre, révoquer…) se font depuis l'onglet
 * « Prélèvements » du bail, que chaque ligne ouvre.
 */
export const DirectDebitMandates: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [status, setStatus] = useState<MandateStatus | undefined>();
  const [creditorId, setCreditorId] = useState<string | undefined>();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const { data: creditors = [] } = useQuery({
    queryKey: queryKey('direct-debit-creditors', tenantId),
    queryFn: () => listCreditors(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const filters = { status, creditorId, search, page, pageSize: PAGE_SIZE };
  const { data, isPending, error } = useQuery({
    queryKey: queryKey('direct-debit-mandates', tenantId, filters),
    queryFn: () => listMandates(tenantId as string, filters),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

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
        <Space wrap size={[12, 12]}>
          <Input.Search
            allowClear
            value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
            placeholder={t('Rechercher (référence, débiteur, titulaire)')}
            style={{ minWidth: 260 }}
          />
          <Select
            allowClear
            placeholder={t('Statut')}
            style={{ minWidth: 160 }}
            value={status}
            onChange={value => {
              setStatus(value);
              setPage(1);
            }}
            options={MANDATE_STATUSES.map(value => ({ value, label: mandateStatusLabel(value) }))}
          />
          <Select
            allowClear
            placeholder={t('Créancier')}
            style={{ minWidth: 200 }}
            value={creditorId}
            onChange={value => {
              setCreditorId(value);
              setPage(1);
            }}
            options={creditors.map(creditor => ({ value: creditor.id, label: creditor.label }))}
          />
        </Space>
        {error && (
          <Alert type="error" showIcon message={apiErrorMessage(error, t('Erreur lors du chargement des mandats'))} />
        )}
        <Table<MandateDto>
          rowKey="id"
          size="middle"
          loading={isPending}
          columns={columns}
          dataSource={data?.items ?? []}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            showSizeChanger: false,
            onChange: next => setPage(next)
          }}
          locale={{ emptyText: t('Aucun mandat de prélèvement') }}
        />
      </Space>
    </>
  );
};
