import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, App, Select, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listCreditors,
  listRemittances,
  RemittanceStatus,
  RemittanceSummaryDto
} from '../../services/direct-debit-service';
import { PageHeader, formatMoney } from '../../components/primitives';
import { DirectDebitTabs } from '../../components/rental/direct-debit/DirectDebitTabs';
import { PrepareRemittanceModal } from '../../components/rental/direct-debit/PrepareRemittanceModal';
import {
  apiErrorMessage,
  formatDay,
  formatPeriod,
  REMITTANCE_STATUSES,
  remittanceStatusLabel,
  RemittanceStatusTag
} from '../../components/rental/direct-debit/direct-debit-shared';
import { detailKey, entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import { t } from '../../i18n/t';

const PAGE_SIZE = 20;

/**
 * Location › Prélèvements › Remises (spec 042, P2, §7.10) : les remises de
 * loyers de l'agence, et le bouton « Préparer une remise ».
 */
export const DirectDebitRemittances: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [status, setStatus] = useState<RemittanceStatus | undefined>();
  const [creditorId, setCreditorId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [preparing, setPreparing] = useState(false);

  const { data: creditors = [] } = useQuery({
    queryKey: queryKey('direct-debit-creditors', tenantId),
    queryFn: () => listCreditors(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const filters = { status, creditorId, page, pageSize: PAGE_SIZE };
  const { data, isPending, error } = useQuery({
    queryKey: queryKey('direct-debit-remittances', tenantId, filters),
    queryFn: () => listRemittances(tenantId as string, filters),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const detailPath = (remittanceId: string) => `/tenant/${tenantId}/rental/direct-debit/remittances/${remittanceId}`;

  const columns: ColumnsType<RemittanceSummaryDto> = [
    {
      title: t('Référence'),
      key: 'reference',
      render: (_value, remittance) => <Link to={detailPath(remittance.id)}>{remittance.reference}</Link>
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_value, remittance) => <RemittanceStatusTag status={remittance.status} />
    },
    { title: t('Créancier'), key: 'creditor', render: (_value, remittance) => remittance.creditor.label },
    {
      title: t('Date de prélèvement'),
      key: 'collectionDate',
      render: (_value, remittance) => formatDay(remittance.collectionDate)
    },
    {
      title: t('Période'),
      key: 'period',
      render: (_value, remittance) => formatPeriod(remittance.periodYear, remittance.periodMonth)
    },
    { title: t('Lignes'), dataIndex: 'lineCount', key: 'lineCount', align: 'end' },
    {
      title: t('Total'),
      key: 'total',
      align: 'end',
      render: (_value, remittance) => formatMoney(remittance.totalAmount)
    },
    {
      title: t('Prénotification au plus tard le'),
      key: 'deadline',
      render: (_value, remittance) => formatDay(remittance.prenotificationDeadline)
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Prélèvements')}
        subtitle={data ? `${data.total}` : undefined}
        primaryAction={{
          label: t('Préparer une remise'),
          icon: <PlusOutlined />,
          onClick: () => setPreparing(true)
        }}
      />
      <DirectDebitTabs />
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space wrap size={[12, 12]}>
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
          <Select
            allowClear
            placeholder={t('Statut')}
            style={{ minWidth: 200 }}
            value={status}
            onChange={value => {
              setStatus(value);
              setPage(1);
            }}
            options={REMITTANCE_STATUSES.map(value => ({ value, label: remittanceStatusLabel(value) }))}
          />
        </Space>
        {error && (
          <Alert type="error" showIcon message={apiErrorMessage(error, t('Erreur lors du chargement des remises'))} />
        )}
        <Table<RemittanceSummaryDto>
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
          locale={{ emptyText: t('Aucune remise de prélèvement') }}
        />
      </Space>
      <PrepareRemittanceModal
        tenantId={tenantId as string}
        open={preparing}
        creditors={creditors}
        initialCreditorId={creditorId}
        onClose={() => setPreparing(false)}
        onCreated={result => {
          setPreparing(false);
          // Le détail s'ouvre sur la remise renvoyée, sans second aller-retour.
          queryClient.setQueryData(
            detailKey('direct-debit-remittances', tenantId, result.remittance.id),
            result.remittance
          );
          void queryClient.invalidateQueries({ queryKey: entityKeyPrefix('direct-debit-remittances', tenantId) });
          message.success(t('Remise {{reference}} préparée', { reference: result.remittance.reference }));
          navigate(detailPath(result.remittance.id), { state: { skipped: result.skipped } });
        }}
      />
    </>
  );
};
