import { useSyndicDirectDebitRights } from './useSyndicDirectDebitRights';
import React, { useMemo, useState } from 'react';
import { Alert, App, Button, Card, Select, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreditorDto, MandateDto, MandateStatus } from '../../../services/direct-debit-service';
import { listSyndicMandates } from '../../../services/syndic-direct-debit-service';
import { listSyndicateLots } from '../../../services/syndic-service';
import { formatMoney } from '../../primitives';
import {
  apiErrorMessage,
  MANDATE_STATUSES,
  mandateStatusLabel,
  MandateStatusTag
} from '../../rental/direct-debit/direct-debit-shared';
import { SyndicMandateActions } from './SyndicMandateActions';
import { SyndicMandateFormModal } from './SyndicMandateFormModal';
import { SYNDIC_DD_KEYS } from './keys';
import { STALE_TIME } from '../../../lib/query-keys';
import { t } from '../../../i18n/t';

const PAGE_SIZE = 20;

interface SyndicMandatesCardProps {
  tenantId: string;
  syndicId: string;
  creditor: CreditorDto | null | undefined;
}

/** Carte « Mandats » : liste filtrable par lot et statut, création, actions. */
export const SyndicMandatesCard: React.FC<SyndicMandatesCardProps> = ({ tenantId, syndicId, creditor }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [lotId, setLotId] = useState<string | undefined>();
  const [status, setStatus] = useState<MandateStatus | undefined>();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { canManage } = useSyndicDirectDebitRights(tenantId);

  const { data: lots = [] } = useQuery({
    queryKey: SYNDIC_DD_KEYS.lots(tenantId, syndicId),
    queryFn: () => listSyndicateLots(tenantId, syndicId),
    staleTime: STALE_TIME.reference
  });
  const lotOptions = useMemo(
    () =>
      lots.map(lot => ({
        id: lot.id,
        label: lot.ownersLabel ? `${lot.lotNumber} — ${lot.ownersLabel}` : lot.lotNumber
      })),
    [lots]
  );

  const filters = { lotId, status, page, pageSize: PAGE_SIZE };
  const { data, isPending, error } = useQuery({
    queryKey: SYNDIC_DD_KEYS.mandates(tenantId, syndicId, filters),
    queryFn: () => listSyndicMandates(tenantId, syndicId, filters),
    staleTime: STALE_TIME.list
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: SYNDIC_DD_KEYS.mandatesPrefix(tenantId) });

  const creditorReady = Boolean(creditor?.isActive);

  const columns: ColumnsType<MandateDto> = [
    { title: t('Référence'), dataIndex: 'reference', key: 'reference' },
    { title: t('Statut'), key: 'status', render: (_value, mandate) => <MandateStatusTag status={mandate.status} /> },
    { title: t('Lot'), key: 'lot', render: (_value, mandate) => mandate.lot?.lotNumber ?? '—' },
    {
      title: t('Copropriétaire'),
      key: 'debtor',
      render: (_value, mandate) => mandate.debtor.displayName ?? '—'
    },
    {
      title: t('IBAN'),
      key: 'iban',
      render: (_value, mandate) => <bdi dir="ltr">{mandate.ibanMasked}</bdi>
    },
    {
      title: t('Plafond'),
      key: 'maxAmount',
      align: 'end',
      render: (_value, mandate) => (mandate.maxAmount != null ? formatMoney(mandate.maxAmount) : '—')
    },
    { title: t('Jour de collecte'), dataIndex: 'effectiveCollectionDay', key: 'day', align: 'end' },
    ...(canManage
      ? [
          {
            title: t('Actions'),
            key: 'actions',
            render: (_value: unknown, mandate: MandateDto) => (
              <SyndicMandateActions
                tenantId={tenantId}
                syndicId={syndicId}
                mandate={mandate}
                onChanged={() => void refresh()}
              />
            )
          }
        ]
      : [])
  ];

  return (
    <Card
      title={t('Mandats de prélèvement')}
      extra={
        canManage ? (
          <Button type="primary" icon={<PlusOutlined />} disabled={!creditorReady} onClick={() => setCreating(true)}>
            {t('Nouveau mandat')}
          </Button>
        ) : null
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {!creditorReady && (
          <Alert
            type="warning"
            showIcon
            message={t('Configurez et activez le compte de prélèvement du syndicat pour créer des mandats.')}
          />
        )}
        <Space wrap size={[12, 12]}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('Lot')}
            aria-label={t('Filtrer par lot')}
            style={{ minWidth: 220 }}
            value={lotId}
            onChange={value => {
              setLotId(value);
              setPage(1);
            }}
            options={lotOptions.map(lot => ({ value: lot.id, label: lot.label }))}
          />
          <Select
            allowClear
            placeholder={t('Statut')}
            aria-label={t('Filtrer par statut')}
            style={{ minWidth: 200 }}
            value={status}
            onChange={value => {
              setStatus(value);
              setPage(1);
            }}
            options={MANDATE_STATUSES.map(value => ({ value, label: mandateStatusLabel(value) }))}
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

      <SyndicMandateFormModal
        tenantId={tenantId}
        syndicId={syndicId}
        open={creating}
        lots={lotOptions}
        onClose={() => setCreating(false)}
        onCreated={(mandate, warnings) => {
          setCreating(false);
          void refresh();
          warnings.forEach(warning => message.warning(warning));
          if (!mandate.hasSignedScan) {
            message.info(
              t("Téléchargez l'autorisation, faites-la signer, puis déposez le scan pour activer le mandat.")
            );
          }
        }}
      />
    </Card>
  );
};
