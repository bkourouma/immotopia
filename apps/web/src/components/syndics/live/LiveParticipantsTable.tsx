import React, { useMemo } from 'react';
import { Badge, Button, Popconfirm, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Table } from '../../primitives';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
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

// Recherche LOCALE (la console reçoit déjà tous les participants et se rafraîchit seule) :
// accesseurs stables, hors du composant. Le filtre ne change que l'AFFICHAGE : les actions
// (copier, révoquer) restent propres à chaque ligne.
const TEXTE_RECHERCHE = [
  (participant: MeetingParticipantView) => participant.name,
  (participant: MeetingParticipantView) => participant.email,
  (participant: MeetingParticipantView) => participant.phone,
  (participant: MeetingParticipantView) => participant.lotNumbers
];
const ACCESSEURS = {
  online: (participant: MeetingParticipantView) => participant.online,
  joined: (participant: MeetingParticipantView) => participant.joinedAt !== null,
  links: (participant: MeetingParticipantView) => participant.activeLinks > 0
};

export const LiveParticipantsTable: React.FC<LiveParticipantsTableProps> = ({
  participants,
  inVisioContactIds,
  readOnly,
  busyContactId,
  onCopyLink,
  onRevoke
}) => {
  // « En visio » dépend de la salle : accesseur recréé seulement si l'ensemble change.
  const accessors = useMemo(
    () => ({
      ...ACCESSEURS,
      visio: (participant: MeetingParticipantView) => Boolean(inVisioContactIds?.has(participant.contactId))
    }),
    [inVisioContactIds]
  );

  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Nom, e-mail, téléphone, lot…')
    },
    {
      key: 'online',
      type: 'boolean',
      label: t('En ligne'),
      primary: true,
      tristate: true,
      trueLabel: t('En ligne'),
      falseLabel: t('Hors ligne')
    },
    {
      key: 'joined',
      type: 'boolean',
      label: t('A rejoint'),
      primary: true,
      tristate: true,
      trueLabel: t('A rejoint'),
      falseLabel: t('Pas encore')
    },
    {
      key: 'links',
      type: 'boolean',
      label: t('Liens actifs'),
      tristate: true,
      trueLabel: t('Avec lien actif'),
      falseLabel: t('Sans lien actif')
    },
    ...(inVisioContactIds
      ? [
          {
            key: 'visio',
            type: 'boolean' as const,
            label: t('En visio'),
            tristate: true,
            trueLabel: t('En visio'),
            falseLabel: t('Pas en visio')
          }
        ]
      : [])
  ];

  const local = useLocalListSearch<MeetingParticipantView>(participants, {
    paramPrefix: 'lp',
    ariaLabel: t('Rechercher dans les participants'),
    defaultPageSize: 20,
    criteria,
    text: TEXTE_RECHERCHE,
    accessors
  });

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
      {...local.tableProps}
      aria-label={t('Participants et liens personnels')}
      exportable={false}
      size="small"
      rowKey="contactId"
      columns={columns}
      scroll={{ x: 'max-content' }}
      pagination={{ ...local.tableProps.pagination, hideOnSinglePage: true, showSizeChanger: false }}
      locale={local.isFiltered ? undefined : { emptyText: t('Aucun participant pour le moment') }}
    />
  );
};
