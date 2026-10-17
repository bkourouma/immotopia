import React, { useState } from 'react';
import { Alert, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { listReturnImports, type ReturnImportDto } from '../../../services/direct-debit-service';
import { apiErrorMessage, formatDate } from './direct-debit-shared';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { t } from '../../../i18n/t';

const { Title } = Typography;

const PAGE_SIZE = 10;

/** Clé de requête de l'historique, pour que l'import l'invalide. */
export const RETURN_IMPORTS_ENTITY = 'direct-debit-return-imports';

/** Historique des fichiers de retour importés (GET `/returns`, spec 042 P3 §8.10). */
export const ReturnImportsHistory: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const [page, setPage] = useState(1);
  const params = { page, pageSize: PAGE_SIZE };
  const { data, isPending, error } = useQuery({
    queryKey: queryKey(RETURN_IMPORTS_ENTITY, tenantId, params),
    queryFn: () => listReturnImports(tenantId, params),
    staleTime: STALE_TIME.list
  });

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
      <Title level={5}>{t('Historique des retours de la banque')}</Title>
      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={apiErrorMessage(error, t("Erreur lors du chargement de l'historique des retours"))}
        />
      )}
      <Table<ReturnImportDto>
        rowKey="id"
        size="small"
        loading={isPending}
        columns={columns}
        dataSource={data?.items ?? []}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          showSizeChanger: false,
          hideOnSinglePage: true,
          onChange: next => setPage(next)
        }}
        locale={{ emptyText: t('Aucun fichier de retour importé') }}
      />
    </section>
  );
};
