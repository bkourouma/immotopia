import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, App, Button, Card, Select, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreditorDto, RemittanceStatus, RemittanceSummaryDto } from '../../../services/direct-debit-service';
import {
  applySyndicReturnFile,
  listSyndicRemittances,
  listSyndicReturnImports,
  previewSyndicReturnFile
} from '../../../services/syndic-direct-debit-service';
import { formatMoney } from '../../primitives';
import {
  apiErrorMessage,
  formatDay,
  REMITTANCE_STATUSES,
  remittanceStatusLabel,
  RemittanceStatusTag
} from '../../rental/direct-debit/direct-debit-shared';
import { ReturnImportModal } from '../../rental/direct-debit/ReturnImportModal';
import { ReturnImportsHistory } from '../../rental/direct-debit/ReturnImportsHistory';
import { SyndicPrepareRemittanceModal } from './SyndicPrepareRemittanceModal';
import { useSyndicDirectDebitRights } from './useSyndicDirectDebitRights';
import { SYNDIC_DD_KEYS } from './keys';
import { STALE_TIME } from '../../../lib/query-keys';
import { t } from '../../../i18n/t';

const PAGE_SIZE = 20;

interface SyndicRemittancesCardProps {
  tenantId: string;
  syndicId: string;
  creditor: CreditorDto | null | undefined;
  /** « Aujourd'hui » ; injectable pour les tests. */
  today?: Date;
}

/** Carte « Remises » : liste, « Préparer une remise » puis ouverture du détail. */
export const SyndicRemittancesCard: React.FC<SyndicRemittancesCardProps> = ({
  tenantId,
  syndicId,
  creditor,
  today
}) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RemittanceStatus | undefined>();
  const [page, setPage] = useState(1);
  const [preparing, setPreparing] = useState(false);
  const [importing, setImporting] = useState(false);
  const { canManage } = useSyndicDirectDebitRights(tenantId);

  const filters = { status, page, pageSize: PAGE_SIZE };
  const { data, isPending, error } = useQuery({
    queryKey: SYNDIC_DD_KEYS.remittances(tenantId, syndicId, filters),
    queryFn: () => listSyndicRemittances(tenantId, syndicId, filters),
    staleTime: STALE_TIME.list
  });

  const detailPath = (remittanceId: string) =>
    `/tenant/${tenantId}/syndics/${syndicId}/prelevements/remises/${remittanceId}`;

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
    {
      title: t('Date de prélèvement'),
      key: 'collectionDate',
      render: (_value, remittance) => formatDay(remittance.collectionDate)
    },
    { title: t('Lignes'), dataIndex: 'lineCount', key: 'lineCount', align: 'end' },
    {
      title: t('Total'),
      key: 'total',
      align: 'end',
      render: (_value, remittance) => formatMoney(remittance.totalAmount)
    },
    {
      title: t('Avis de prélèvement au plus tard le'),
      key: 'deadline',
      render: (_value, remittance) => formatDay(remittance.prenotificationDeadline)
    }
  ];

  return (
    <Card
      title={t('Remises')}
      extra={
        canManage ? (
          <Space wrap>
            <Button icon={<UploadOutlined />} disabled={!creditor} onClick={() => setImporting(true)}>
              {t('Importer un retour de la banque')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!creditor?.isActive}
              onClick={() => setPreparing(true)}
            >
              {t('Préparer une remise')}
            </Button>
          </Space>
        ) : null
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Select
          allowClear
          placeholder={t('Statut')}
          aria-label={t('Filtrer les remises par statut')}
          style={{ minWidth: 200 }}
          value={status}
          onChange={value => {
            setStatus(value);
            setPage(1);
          }}
          options={REMITTANCE_STATUSES.map(value => ({ value, label: remittanceStatusLabel(value) }))}
        />
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
          onRow={remittance => ({
            onClick: () => navigate(detailPath(remittance.id)),
            style: { cursor: 'pointer' }
          })}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            showSizeChanger: false,
            onChange: next => setPage(next)
          }}
          locale={{ emptyText: t('Aucune remise de prélèvement') }}
        />
        <ReturnImportsHistory
          tenantId={tenantId}
          entity={SYNDIC_DD_KEYS.returns}
          scopeKey={syndicId}
          fetchPage={params => listSyndicReturnImports(tenantId, syndicId, params)}
        />
      </Space>

      <ReturnImportModal
        tenantId={tenantId}
        scope="SYNDIC_LOT"
        api={{
          preview: file => previewSyndicReturnFile(tenantId, syndicId, file),
          apply: file => applySyndicReturnFile(tenantId, syndicId, file)
        }}
        open={importing}
        onClose={() => setImporting(false)}
        onApplied={result => {
          // Les constats changent les remises (statuts, retour) et l'historique.
          void queryClient.invalidateQueries({ queryKey: SYNDIC_DD_KEYS.remittancesPrefix(tenantId) });
          void queryClient.invalidateQueries({ queryKey: SYNDIC_DD_KEYS.returnsPrefix(tenantId) });
          if (result.appliedSummary.failed > 0) {
            message.warning(
              t('Fichier {{name}} importé, mais {{n}} constats ont échoué.', {
                name: result.fileName,
                n: result.appliedSummary.failed
              })
            );
          } else {
            message.success(t('Fichier {{name}} importé.', { name: result.fileName }));
          }
        }}
      />

      <SyndicPrepareRemittanceModal
        tenantId={tenantId}
        syndicId={syndicId}
        open={preparing}
        creditor={creditor}
        today={today}
        onClose={() => setPreparing(false)}
        onCreated={result => {
          setPreparing(false);
          void queryClient.invalidateQueries({ queryKey: SYNDIC_DD_KEYS.remittancesPrefix(tenantId) });
          message.success(t('Remise {{reference}} préparée', { reference: result.remittance.reference }));
          navigate(detailPath(result.remittance.id), { state: { skipped: result.skipped } });
        }}
      />
    </Card>
  );
};
