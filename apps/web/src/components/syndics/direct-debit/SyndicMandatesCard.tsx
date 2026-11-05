import { useSyndicDirectDebitRights } from './useSyndicDirectDebitRights';
import React, { useMemo, useState } from 'react';
import { Alert, App, Button, Card, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreditorDto, MandateDto } from '../../../services/direct-debit-service';
import { listSyndicMandates } from '../../../services/syndic-direct-debit-service';
import { listSyndicateLots } from '../../../services/syndic-service';
import { formatMoney, Table } from '../../primitives';
import { useListSearch } from '../../../hooks/useListSearch';
import { collectAllPages } from '../../../utils/table-export/collect';
import {
  apiErrorMessage,
  MANDATE_STATUSES,
  mandateStatusLabel,
  MandateStatusTag
} from '../../rental/direct-debit/direct-debit-shared';
import { MandateSignatureSection } from '../../direct-debit/MandateSignatureSection';
import { SyndicMandateActions } from './SyndicMandateActions';
import { SyndicMandateFormModal } from './SyndicMandateFormModal';
import { SYNDIC_DD_KEYS } from './keys';
import { STALE_TIME } from '../../../lib/query-keys';
import { t } from '../../../i18n/t';

interface SyndicMandatesCardProps {
  tenantId: string;
  syndicId: string;
  creditor: CreditorDto | null | undefined;
}

/** Carte « Mandats » : liste filtrable par lot et statut, création, actions. */
export const SyndicMandatesCard: React.FC<SyndicMandatesCardProps> = ({ tenantId, syndicId, creditor }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  // Signature électronique : lancer, relancer, annuler et lire les PDF exigent SYNDIC_DIRECT_DEBIT_MANAGE (SIG-S5).
  const { canManage } = useSyndicDirectDebitRights(tenantId);
  const [signatureOpen, setSignatureOpen] = useState<string[]>([]);
  const toggleSignature = (mandate: MandateDto) =>
    setSignatureOpen(keys =>
      keys.includes(mandate.id) ? keys.filter(key => key !== mandate.id) : [...keys, mandate.id]
    );

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

  // Liste paginée par l'API (`pageSize`, pas de tri) : les critères partent à l'API.
  const search = useListSearch({
    paramPrefix: 'man',
    ariaLabel: t('Rechercher dans les mandats'),
    apiNames: { limit: 'pageSize', sort: false },
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Titulaire, lot, copropriétaire, référence, fin d’IBAN…')
      },
      {
        key: 'status',
        type: 'select',
        label: t('Statut'),
        primary: true,
        options: MANDATE_STATUSES.map(value => ({ value, label: mandateStatusLabel(value) }))
      },
      {
        key: 'lotId',
        type: 'select',
        label: t('Lot'),
        primary: true,
        options: lots.map(lot => ({ value: lot.id, label: lot.lotNumber }))
      }
    ]
  });

  const { data, isFetching, error } = useQuery({
    queryKey: SYNDIC_DD_KEYS.mandates(tenantId, syndicId, search.apiParams),
    queryFn: () => listSyndicMandates(tenantId, syndicId, search.apiParams),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });

  const refresh = () => {
    // Le nombre de mandats ouverts du compte change avec les mandats.
    void queryClient.invalidateQueries({ queryKey: SYNDIC_DD_KEYS.creditorPrefix(tenantId) });
    return queryClient.invalidateQueries({ queryKey: SYNDIC_DD_KEYS.mandatesPrefix(tenantId) });
  };

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
                onToggleSignature={toggleSignature}
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
        {error && (
          <Alert type="error" showIcon message={apiErrorMessage(error, t('Erreur lors du chargement des mandats'))} />
        )}
        <Table<MandateDto>
          aria-label={t('Mandats de prélèvement')}
          search={search.searchProps}
          exportFilename={t('Mandats de prélèvement')}
          exportFetchAll={() =>
            collectAllPages<MandateDto>(async (page, limit) => {
              const response = await listSyndicMandates(tenantId, syndicId, {
                ...search.filterParams,
                page,
                pageSize: limit
              });
              return { items: response.items, total: response.total };
            })
          }
          rowKey="id"
          size="middle"
          loading={isFetching}
          columns={columns}
          dataSource={data?.items ?? []}
          scroll={{ x: 'max-content' }}
          expandable={{
            showExpandColumn: false,
            expandedRowKeys: signatureOpen,
            rowExpandable: mandate => canManage && mandate.status === 'DRAFT',
            expandedRowRender: mandate => (
              <MandateSignatureSection
                kind="SYNDIC_DIRECT_DEBIT_MANDATE"
                mandateId={mandate.id}
                status={mandate.status}
                hasSignedScan={mandate.hasSignedScan}
                signedAt={mandate.signedAt}
                reference={mandate.reference}
                onChanged={() => void refresh()}
              />
            )
          }}
          pagination={search.tablePagination(data?.total ?? 0)}
          locale={search.isFiltered ? undefined : { emptyText: t('Aucun mandat de prélèvement') }}
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
