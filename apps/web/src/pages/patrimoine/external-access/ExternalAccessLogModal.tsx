import React from 'react';
import { Modal, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { listExternalAccessLog } from '../../../services/external-access-service';
import type { ExternalAccessGrantSummary, ExternalAccessLogEntry } from '../../../types/external-access';
import { StateBlock, SkeletonList } from '../../../components/primitives';
import { activeLocale } from '../../../i18n/format';
import { queryKey } from '../../../lib/query-keys';
import { t } from '../../../i18n/t';
import { accessLogActionLabel, accessSectionLabel } from './external-access-labels';

const { Text } = Typography;

interface Props {
  tenantId: string;
  grant: ExternalAccessGrantSummary | null;
  onClose: () => void;
}

/** Journal des consultations, téléchargements et envois d'un accès. */
export const ExternalAccessLogModal: React.FC<Props> = ({ tenantId, grant, onClose }) => {
  const logQuery = useQuery({
    queryKey: queryKey('external-access-log', tenantId, { grantId: grant?.id }),
    queryFn: () => listExternalAccessLog(tenantId, grant?.id as string),
    enabled: grant !== null,
    // Un journal se relit à chaque ouverture : il n'est jamais « frais ».
    staleTime: 0
  });

  return (
    <Modal
      open={grant !== null}
      width={760}
      title={grant ? t('Journal — {{name}}', { name: grant.recipientName }) : ''}
      onCancel={onClose}
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
      ) : (logQuery.data ?? []).length === 0 ? (
        <StateBlock variant="empty" description={t('Aucune consultation pour le moment.')} />
      ) : (
        <Table<ExternalAccessLogEntry>
          size="small"
          rowKey="id"
          pagination={false}
          scroll={{ x: 'max-content' }}
          dataSource={logQuery.data}
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
      )}
    </Modal>
  );
};
