import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, App, Button, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listCreditors,
  listRemittances,
  RemittanceListFilters,
  RemittanceSummaryDto
} from '../../services/direct-debit-service';
import { PageHeader, Table, formatMoney } from '../../components/primitives';
import { DirectDebitTabs } from '../../components/rental/direct-debit/DirectDebitTabs';
import { PrepareRemittanceModal } from '../../components/rental/direct-debit/PrepareRemittanceModal';
import { invalidateRentalCollections } from '../../components/rental/direct-debit/ReturnConstatModals';
import { ReturnImportModal } from '../../components/rental/direct-debit/ReturnImportModal';
import { RETURN_IMPORTS_ENTITY, ReturnImportsHistory } from '../../components/rental/direct-debit/ReturnImportsHistory';
import {
  apiErrorMessage,
  formatDay,
  formatPeriod,
  REMITTANCE_STATUSES,
  remittanceStatusLabel,
  RemittanceStatusTag
} from '../../components/rental/direct-debit/direct-debit-shared';
import { useListSearch } from '../../hooks/useListSearch';
import { detailKey, entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import { collectAllPages } from '../../utils/table-export/collect';
import { t } from '../../i18n/t';
import { helpAnchor } from '../../help';

/**
 * Location › Prélèvements › Remises (spec 042, P2, §7.10) : les remises de
 * loyers de l'agence, et le bouton « Préparer une remise ».
 *
 * Recherche multicritères paginée par le serveur (guide recherche-listes.md) :
 * `?q=…&status=EXPORTED&creditorId=…&collectionFrom=…&page=2`. L'API nomme la
 * taille de page `pageSize` et ne trie pas. L'historique des retours, plus bas,
 * a sa propre barre (préfixe `ret`).
 */
export const DirectDebitRemittances: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [preparing, setPreparing] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data: creditors = [] } = useQuery({
    queryKey: queryKey('direct-debit-creditors', tenantId),
    queryFn: () => listCreditors(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const search = useListSearch({
    ariaLabel: t('Rechercher dans les remises'),
    apiNames: { limit: 'pageSize', sort: false },
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Référence de la remise, créancier…')
      },
      {
        key: 'status',
        type: 'select',
        label: t('Statut'),
        primary: true,
        options: REMITTANCE_STATUSES.map(value => ({ value, label: remittanceStatusLabel(value) }))
      },
      {
        key: 'creditorId',
        type: 'select',
        label: t('Créancier'),
        primary: true,
        options: creditors.map(creditor => ({ value: creditor.id, label: creditor.label }))
      },
      {
        key: 'collection',
        type: 'dateRange',
        label: t('Date de prélèvement'),
        api: ['collectionFrom', 'collectionTo']
      }
    ]
  });
  const creditorId = search.values.creditorId as string | undefined;

  const { data, isFetching, error } = useQuery({
    queryKey: queryKey('direct-debit-remittances', tenantId, search.apiParams),
    queryFn: () => listRemittances(tenantId as string, search.apiParams as RemittanceListFilters),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });
  const total = data?.total ?? 0;

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
      title: t('Avis de prélèvement au plus tard le'),
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
          helpAnchor: 'remises-preparer',
          icon: <PlusOutlined />,
          onClick: () => setPreparing(true)
        }}
      />
      <DirectDebitTabs />
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space wrap size={[12, 12]}>
          <Button icon={<UploadOutlined />} onClick={() => setImporting(true)} {...helpAnchor('remises-import')}>
            {t('Importer un retour de la banque')}
          </Button>
        </Space>
        {error && (
          <Alert type="error" showIcon message={apiErrorMessage(error, t('Erreur lors du chargement des remises'))} />
        )}
        <div {...helpAnchor('remises-tableau')}>
          <Table<RemittanceSummaryDto>
            helpId="locatif.prelevements.remises.tableau"
            aria-label={t('Remises de prélèvement')}
            rowKey="id"
            size="middle"
            search={search.searchProps}
            exportFilename={t('Remises de prélèvement')}
            exportFetchAll={() =>
              collectAllPages<RemittanceSummaryDto>(async (page, limit) => {
                const response = await listRemittances(tenantId as string, {
                  ...(search.filterParams as RemittanceListFilters),
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
            locale={search.isFiltered ? undefined : { emptyText: t('Aucune remise de prélèvement') }}
          />
        </div>
        <ReturnImportsHistory tenantId={tenantId as string} helpId="locatif.prelevements.retours.historique" />
      </Space>
      <ReturnImportModal
        helpId="locatif.prelevements.retours.import"
        tenantId={tenantId as string}
        open={importing}
        onClose={() => setImporting(false)}
        onApplied={result => {
          // Les constats changent les remises (statuts, retour) et l'historique.
          void queryClient.invalidateQueries({ queryKey: entityKeyPrefix('direct-debit-remittances', tenantId) });
          void queryClient.invalidateQueries({ queryKey: entityKeyPrefix(RETURN_IMPORTS_ENTITY, tenantId) });
          invalidateRentalCollections(queryClient, tenantId);
          const failed = result.appliedSummary.failed;
          if (failed > 0) {
            message.warning(
              t('Fichier {{name}} importé, mais {{n}} constats ont échoué.', { name: result.fileName, n: failed })
            );
          } else {
            message.success(t('Fichier {{name}} importé.', { name: result.fileName }));
          }
        }}
      />
      <PrepareRemittanceModal
        helpId="locatif.prelevements.remises.preparer"
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
