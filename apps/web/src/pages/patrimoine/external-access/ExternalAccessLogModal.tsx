import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Modal, Tag, Typography } from 'antd';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listExternalAccessLogPage } from '../../../services/external-access-service';
import type { ExternalAccessGrantSummary, ExternalAccessLogEntry } from '../../../types/external-access';
import { StateBlock, SkeletonList, Table } from '../../../components/primitives';
import { activeLocale } from '../../../i18n/format';
import { queryKey } from '../../../lib/query-keys';
import { t } from '../../../i18n/t';
import { useListSearch } from '../../../hooks/useListSearch';
import type { SearchCriterion } from '../../../utils/list-search';
import { accessLogActionLabel, accessSectionLabel } from './external-access-labels';
import { collectAllPages } from '../../../utils/table-export/collect';

const { Text } = Typography;

/** Préfixe d'URL de la barre du journal (la page « Accès partagés » porte déjà ses propres clés). */
const LOG_PREFIX = 'jrn';

// Accesseurs stables (hors composant). Le champ libre cherche ce que le tableau affiche :
// l'événement, le document ou les rubriques, l'adresse IP.
const ACTIONS = ['VIEWED', 'DOCUMENT_DOWNLOADED', 'LINK_SENT', 'CREATED', 'UPDATED', 'REVOKED'];

interface Props {
  tenantId: string;
  grant: ExternalAccessGrantSummary | null;
  onClose: () => void;
}

/** Journal des consultations, téléchargements et envois d'un accès. */
export const ExternalAccessLogModal: React.FC<Props> = ({ tenantId, grant, onClose }) => {
  const [, setSearchParams] = useSearchParams();
  const actionOptions = ACTIONS.map(action => ({ value: action, label: accessLogActionLabel(action) }));
  const criteres: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Document ou adresse IP…'),
      api: 'search'
    },
    {
      key: 'evenement',
      type: 'multiSelect',
      label: t('Événement'),
      primary: true,
      options: actionOptions,
      api: 'actions'
    },
    { key: 'date', type: 'dateRange', label: t('Date'), api: ['dateFrom', 'dateTo'] }
  ];
  const search = useListSearch({
    paramPrefix: LOG_PREFIX,
    ariaLabel: t('Rechercher dans le journal'),
    criteria: criteres,
    apiNames: { sort: false }
  });
  const logQuery = useQuery({
    queryKey: queryKey('external-access-log', tenantId, { grantId: grant?.id, ...search.apiParams }),
    queryFn: () =>
      listExternalAccessLogPage(tenantId, grant?.id as string, {
        ...search.apiParams,
        page: search.page,
        limit: Math.min(search.pageSize, 100)
      }),
    enabled: grant !== null,
    staleTime: 0,
    placeholderData: keepPreviousData
  });

  // À la fermeture, les clés `jrn.*` ne restent pas dans l'adresse de la page.
  const close = () => {
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        for (const key of Array.from(next.keys())) {
          if (key.startsWith(`${LOG_PREFIX}.`)) next.delete(key);
        }
        return next;
      },
      { replace: true }
    );
    onClose();
  };

  return (
    <Modal
      open={grant !== null}
      width={760}
      title={grant ? t('Journal — {{name}}', { name: grant.recipientName }) : ''}
      onCancel={close}
      footer={null}
      destroyOnHidden
    >
      {logQuery.error ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger le journal.')}
          actions={[{ label: t('Réessayer'), onClick: () => logQuery.refetch(), primary: true }]}
        />
      ) : logQuery.isPending ? (
        <SkeletonList rows={4} aria-label={t('Journal en cours de chargement')} />
      ) : (logQuery.data?.total ?? 0) === 0 && !search.isFiltered ? (
        <StateBlock variant="empty" description={t('Aucune consultation pour le moment.')} />
      ) : (
        <>
          <Table<ExternalAccessLogEntry>
            dataSource={logQuery.data?.items ?? []}
            search={search.searchProps}
            pagination={search.tablePagination(logQuery.data?.total ?? 0)}
            aria-label={t('Journal des consultations')}
            exportFilename={t('Journal — {{name}}', { name: grant?.recipientName ?? '' })}
            exportFetchAll={() =>
              collectAllPages((page, limit) =>
                listExternalAccessLogPage(tenantId, grant?.id as string, { ...search.filterParams, page, limit })
              )
            }
            size="small"
            rowKey="id"
            scroll={{ x: 'max-content' }}
            columns={[
              {
                title: t('Date'),
                dataIndex: 'at',
                render: (value: string) => new Date(value).toLocaleString(activeLocale())
              },
              {
                title: t('Événement'),
                dataIndex: 'action',
                render: (value: string) => <Tag>{accessLogActionLabel(value)}</Tag>
              },
              {
                title: t('Détail'),
                render: (_: unknown, entry) =>
                  entry.documentName ? (
                    <Text>{entry.documentName}</Text>
                  ) : entry.sections && entry.sections.length > 0 ? (
                    <Text>{entry.sections.map(accessSectionLabel).join(', ')}</Text>
                  ) : (
                    '—'
                  )
              },
              {
                title: t('Adresse IP'),
                dataIndex: 'ipAddress',
                render: (value: string | null) => (value ? <bdi dir="ltr">{value}</bdi> : '—')
              }
            ]}
          />
        </>
      )}
    </Modal>
  );
};
