import React from 'react';
import { Badge, Button, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MeetingParticipantView } from '../../../types/syndic-live-types';
import { formatDateTime } from './live-labels';
import { t } from '../../../i18n/t';

const { Text } = Typography;

interface LiveParticipantsTableProps {
  participants: MeetingParticipantView[];
  /** Contacts actuellement dans la salle de visio (spec 045) ; absent si la visio n'est pas activée. */
  inVisioContactIds?: ReadonlySet<string>;
  readOnly: boolean;
  busyContactId: string | null;
  onCopyLink: (participant: MeetingParticipantView) => void;
  onRevoke: (participant: MeetingParticipantView) => void;
}

export const LiveParticipantsTable: React.FC<LiveParticipantsTableProps> = ({
  participants,
  inVisioContactIds,
  readOnly,
  busyContactId,
  onCopyLink,
  onRevoke
}) => {
  const columns: ColumnsType<MeetingParticipantView> = [
    {
      title: t('Participant'),
      key: 'name',
      render: (_: unknown, participant) => (
        <Space direction="vertical" size={0}>
          <Text strong>{participant.name}</Text>
          {participant.email ? <Text type="secondary">{participant.email}</Text> : null}
        </Space>
      )
    },
    { title: t('Lots'), key: 'lots', render: (_: unknown, participant) => participant.lotNumbers.join(', ') || '-' },
    {
      title: t('A rejoint'),
      key: 'joined',
      render: (_: unknown, participant) =>
        participant.joinedAt ? formatDateTime(participant.joinedAt) : <Text type="secondary">{t('Pas encore')}</Text>
    },
    {
      title: t('En ligne'),
      key: 'online',
      render: (_: unknown, participant) => (
        <Space size={8} wrap>
          <Badge
            status={participant.online ? 'success' : 'default'}
            text={participant.online ? t('En ligne') : t('Hors ligne')}
          />
          {inVisioContactIds?.has(participant.contactId) ? <Tag color="blue">{t('En visio')}</Tag> : null}
        </Space>
      )
    },
    { title: t('Liens actifs'), dataIndex: 'activeLinks', key: 'links', align: 'end' },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, participant) => (
        <Space wrap>
          <Button
            size="small"
            disabled={readOnly || busyContactId !== null}
            loading={busyContactId === participant.contactId}
            aria-label={t('Copier le lien de {{name}}', { name: participant.name })}
            onClick={() => onCopyLink(participant)}
          >
            {t('Copier le lien')}
          </Button>
          <Popconfirm
            title={t('Révoquer les liens ?')}
            description={t('Les liens déjà envoyés à {{name}} cesseront de fonctionner.', { name: participant.name })}
            okText={t('Révoquer')}
            cancelText={t('Annuler')}
            onConfirm={() => onRevoke(participant)}
            disabled={readOnly || participant.activeLinks === 0}
          >
            <Button
              size="small"
              danger
              disabled={readOnly || participant.activeLinks === 0 || busyContactId !== null}
              aria-label={t('Révoquer les liens de {{name}}', { name: participant.name })}
            >
              {t('Révoquer les liens')}
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <Table<MeetingParticipantView>
      size="small"
      rowKey="contactId"
      dataSource={participants}
      columns={columns}
      scroll={{ x: 'max-content' }}
      pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }}
      locale={{ emptyText: t('Aucun participant pour le moment') }}
    />
  );
};
