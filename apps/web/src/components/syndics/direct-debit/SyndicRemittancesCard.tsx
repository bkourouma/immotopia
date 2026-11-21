import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { App, Button, Card, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreditorDto, RemittanceSummaryDto } from '../../../services/direct-debit-service';
import {
  applySyndicReturnFile,
  listSyndicRemittances,
  listSyndicReturnImports,
  previewSyndicReturnFile
} from '../../../services/syndic-direct-debit-service';
import { DataCard, DataView, formatMoney } from '../../primitives';
import { useListSearch } from '../../../hooks/useListSearch';
import { collectAllPages } from '../../../utils/table-export/collect';
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
  const [preparing, setPreparing] = useState(false);
  const [importing, setImporting] = useState(false);
  const { canManage } = useSyndicDirectDebitRights(tenantId);

  // Liste paginée par l'API (`pageSize`, pas de tri) : les critères partent à l'API.
  const search = useListSearch({
    paramPrefix: 'rem',
    ariaLabel: t('Rechercher dans les remises'),
    apiNames: { limit: 'pageSize', sort: false },
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Référence de la remise (PRL-…)') },
      {
        key: 'status',
        type: 'select',
        label: t('Statut'),
        primary: true,
        options: REMITTANCE_STATUSES.map(value => ({ value, label: remittanceStatusLabel(value) }))
      },
      {
        key: 'collection',
        type: 'dateRange',
        label: t('Date de prélèvement'),
        primary: true,
        api: ['from', 'to']
      }
    ]
  });

  const { data, isFetching, isPending, error, refetch } = useQuery({
    queryKey: SYNDIC_DD_KEYS.remittances(tenantId, syndicId, search.apiParams),
    queryFn: () => listSyndicRemittances(tenantId, syndicId, search.apiParams),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });

  const detailPath = (remittanceId: string) =>
    `/tenant/${tenantId}/syndics/${syndicId}/prelevements/remises/${remittanceId}`;

  /** Carte mobile : référence, statut et total d'un coup d'œil ; toute la carte ouvre le détail. */
  const renderCard = (remittance: RemittanceSummaryDto) => (
    <DataCard
      title={remittance.reference}
      subtitle={t('Prélèvement le {{date}}', { date: formatDay(remittance.collectionDate) })}
      highlight={formatMoney(remittance.totalAmount)}
      status={<RemittanceStatusTag status={remittance.status} />}
      onOpen={() => navigate(detailPath(remittance.id))}
      fields={[
        { label: t('Lignes'), value: remittance.lineCount },
        { label: t('Avis de prélèvement au plus tard le'), value: formatDay(remittance.prenotificationDeadline) }
      ]}
      primaryAction={{ label: t('Ouvrir la remise'), onClick: () => navigate(detailPath(remittance.id)) }}
    />
  );

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
        <DataView<RemittanceSummaryDto>
          {...search.dataViewProps}
          helpId="syndic.prelevements.remises"
          aria-label={t('Remises')}
          search={search.searchProps}
          export={{
            filename: t('Remises'),
            fetchAll: () =>
              collectAllPages<RemittanceSummaryDto>(async (page, limit) => {
                const response = await listSyndicRemittances(tenantId, syndicId, {
                  ...search.filterParams,
                  page,
                  pageSize: limit
                });
                return { items: response.items, total: response.total };
              })
          }}
          rowKey={remittance => remittance.id}
          items={data?.items ?? []}
          total={data?.total ?? 0}
          loading={isPending}
          isReloading={isFetching}
          error={error ? apiErrorMessage(error, t('Erreur lors du chargement des remises')) : null}
          onRetry={() => void refetch()}
          errorCause={error}
          columns={columns}
          scrollX={900}
          emptyDescription={t(
            'Aucune remise de prélèvement. Préparez une remise pour regrouper les prélèvements du mois et l’envoyer à la banque.'
          )}
          emptyAction={
            canManage && creditor?.isActive
              ? { label: t('Préparer une remise'), onClick: () => setPreparing(true) }
              : undefined
          }
          renderCard={renderCard}
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
