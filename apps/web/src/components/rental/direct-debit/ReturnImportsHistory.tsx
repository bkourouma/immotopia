import React from 'react';
import { Alert, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  listReturnImports,
  type ReturnImportDto,
  type ReturnImportListResult
} from '../../../services/direct-debit-service';
import { Table } from '../../primitives';
import { useListSearch } from '../../../hooks/useListSearch';
import { collectAllPages } from '../../../utils/table-export/collect';
import { apiErrorMessage, formatDate } from './direct-debit-shared';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { t } from '../../../i18n/t';
import { HelpSectionTitle } from '../../../help';

const { Title } = Typography;

const PAGE_SIZE = 10;

/** Clé de requête de l'historique, pour que l'import l'invalide. */
export const RETURN_IMPORTS_ENTITY = 'direct-debit-return-imports';

/** Paramètres d'une page de l'historique (l'API nomme la taille de page `pageSize`). */
export interface ReturnImportsPageParams {
  page: number;
  pageSize: number;
  search?: string;
  from?: string;
  to?: string;
}

/**
 * Historique des fichiers de retour importés (GET `/returns`, spec 042 P3 §8.10).
 * Copropriété (P4) : `fetchPage` et `entity` propres au syndicat.
 *
 * Recherche paginée par le serveur (nom du fichier, période d'import). L'état
 * vit dans l'URL sous le préfixe `ret` (`?ret.q=…&ret.page=2`) : c'est une
 * section de la page, pas une modale, et le préfixe l'empêche d'écraser la
 * liste des remises qui la précède (locatif) ou l'écran de la copropriété.
 */
export const ReturnImportsHistory: React.FC<{
  tenantId: string;
  entity?: string;
  /** Extra de clé (le syndicat) pour que deux copropriétés ne partagent pas leur cache. */
  scopeKey?: string;
  fetchPage?: (params: ReturnImportsPageParams) => Promise<ReturnImportListResult>;
  /** Fiche d'aide à afficher à côté du titre (absente : pas de « ? »). */
  helpId?: string;
}> = ({ tenantId, entity = RETURN_IMPORTS_ENTITY, scopeKey, fetchPage, helpId }) => {
  const search = useListSearch({
    paramPrefix: 'ret',
    ariaLabel: t("Rechercher dans l'historique des retours"),
    defaultPageSize: PAGE_SIZE,
    apiNames: { limit: 'pageSize', sort: false },
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Nom du fichier…') },
      { key: 'imported', type: 'dateRange', label: t('Importé le'), primary: true, api: ['from', 'to'] }
    ]
  });
  const fetchList = (params: ReturnImportsPageParams) =>
    fetchPage ? fetchPage(params) : listReturnImports(tenantId, params);
  const params = search.apiParams as unknown as ReturnImportsPageParams;
  const { data, isFetching, error } = useQuery({
    queryKey: queryKey(entity, tenantId, scopeKey ? { ...search.apiParams, scopeKey } : search.apiParams),
    queryFn: () => fetchList(params),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });
  const total = data?.total ?? 0;

  const columns: ColumnsType<ReturnImportDto> = [
    { title: t('Date'), key: 'createdAt', render: (_value, item) => formatDate(item.createdAt) },
    {
      title: t('Fichier'),
      key: 'fileName',
      render: (_value, item) => <bdi dir="ltr">{item.fileName}</bdi>
    },
    { title: t('Lignes lues'), dataIndex: 'recordCount', key: 'recordCount', align: 'end' },
    { title: t('Réglées'), dataIndex: 'settledCount', key: 'settledCount', align: 'end' },
    { title: t('Rejetées'), dataIndex: 'rejectedCount', key: 'rejectedCount', align: 'end' },
    { title: t('Ignorées'), dataIndex: 'skippedCount', key: 'skippedCount', align: 'end' },
    { title: t('Erreurs'), dataIndex: 'errorCount', key: 'errorCount', align: 'end' },
    {
      title: t('Importé par'),
      key: 'importedBy',
      render: (_value, item) => item.importedBy?.fullName ?? '—'
    }
  ];

  return (
    <section aria-label={t('Historique des retours de la banque')}>
      <Title level={5}>
        {helpId ? (
          <HelpSectionTitle title={t('Historique des retours de la banque')} helpId={helpId} />
        ) : (
          t('Historique des retours de la banque')
        )}
      </Title>
      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={apiErrorMessage(error, t("Erreur lors du chargement de l'historique des retours"))}
        />
      )}
      <Table<ReturnImportDto>
        aria-label={t('Historique des retours de la banque')}
        rowKey="id"
        size="small"
        search={search.searchProps}
        exportFilename={t('Historique des retours de la banque')}
        exportFetchAll={() =>
          collectAllPages<ReturnImportDto>(async (page, limit) => {
            const response = await fetchList({
              ...(search.filterParams as unknown as ReturnImportsPageParams),
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
        pagination={{ ...search.tablePagination(total), showSizeChanger: false, hideOnSinglePage: true }}
        locale={search.isFiltered ? undefined : { emptyText: t('Aucun fichier de retour importé') }}
      />
    </section>
  );
};
