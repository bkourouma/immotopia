import React, { Suspense, useState } from 'react';
import { Button, Card, Checkbox, Modal, Space, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BellFilled } from '@ant-design/icons';
import type { MeetingVisioAdminView, MeetingVisioParticipant, VisioJoinInfo } from '../../../types/syndic-live-types';
import { formatDateTime } from '../live/live-labels';
import { t } from '../../../i18n/t';

const { Text } = Typography;

// `livekit-client` n'entre pas dans le paquet initial : la salle est chargée à l'ouverture.
const MeetingVisioRoom = React.lazy(() => import('./MeetingVisioRoom'));

/** Mains levées d'abord (la plus ancienne en tête), puis les autres par nom. */
export function sortVisioParticipants(participants: MeetingVisioParticipant[]): MeetingVisioParticipant[] {
  return participants.slice().sort((a, b) => {
    if (a.handRaisedAt && b.handRaisedAt) return a.handRaisedAt.localeCompare(b.handRaisedAt);
    if (a.handRaisedAt) return -1;
    if (b.handRaisedAt) return 1;
    return a.name.localeCompare(b.name);
  });
}

interface MeetingVisioCardProps {
  visio: MeetingVisioAdminView;
  /** AG terminée ou annulée : plus de salle à ouvrir, plus d'action de modération. */
  frozen: boolean;
  roomOpen: boolean;
  onToggleRoom: () => void;
  getToken: () => Promise<VisioJoinInfo>;
  busyParticipantId: string | null;
  onSpeak: (participant: MeetingVisioParticipant, allowed: boolean) => void;
  onRemove: (participant: MeetingVisioParticipant, revokeLinks: boolean) => Promise<void>;
  /** L'AG est en cours : seul moment où l'on peut démarrer un enregistrement. */
  inProgress?: boolean;
  recordingBusy?: boolean;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
}

export const MeetingVisioCard: React.FC<MeetingVisioCardProps> = ({
  visio,
  frozen,
  roomOpen,
  onToggleRoom,
  getToken,
  busyParticipantId,
  onSpeak,
  onRemove,
  inProgress = false,
  recordingBusy = false,
  onStartRecording,
  onStopRecording
}) => {
  const recording = visio.recording;
  const activeRecording = recording?.enabled ? recording.active : null;
  const [removing, setRemoving] = useState<MeetingVisioParticipant | null>(null);
  const [revokeLinks, setRevokeLinks] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);

  const closeRemoval = () => {
    setRemoving(null);
    setRevokeLinks(false);
  };

  const confirmRemoval = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      await onRemove(removing, revokeLinks);
      closeRemoval();
    } finally {
      setRemoveBusy(false);
    }
  };

  const columns: ColumnsType<MeetingVisioParticipant> = [
    {
      title: t('Participant'),
      key: 'name',
      render: (_: unknown, participant) => (
        <Space size={8} wrap>
          <Text strong>{participant.name}</Text>
          {participant.kind === 'MANAGER' ? <Tag>{t('Gestionnaire')}</Tag> : null}
        </Space>
      )
    },
    {
      title: t('État'),
      key: 'state',
      render: (_: unknown, participant) => (
        <Space size={4} wrap>
          {participant.handRaisedAt ? (
            <Tag color="gold" icon={<BellFilled />}>
              {t('Main levée')}
            </Tag>
          ) : null}
          {participant.kind === 'COOWNER' && participant.canSpeak ? <Tag color="green">{t('A la parole')}</Tag> : null}
        </Space>
      )
    },
    {
      title: t('Entré à'),
      key: 'joinedAt',
      render: (_: unknown, participant) => (participant.joinedAt ? formatDateTime(participant.joinedAt) : '-')
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, participant) => {
        if (participant.kind !== 'COOWNER' || !participant.participantId) return null;
        const busy = busyParticipantId === participant.participantId;
        return (
          <Space wrap>
            <Button
              size="small"
              type={participant.canSpeak ? 'default' : 'primary'}
              disabled={frozen || busyParticipantId !== null}
              loading={busy}
              aria-label={
                participant.canSpeak
                  ? t('Retirer la parole à {{name}}', { name: participant.name })
                  : t('Donner la parole à {{name}}', { name: participant.name })
              }
              onClick={() => onSpeak(participant, !participant.canSpeak)}
            >
              {participant.canSpeak ? t('Retirer la parole') : t('Donner la parole')}
            </Button>
            <Button
              size="small"
              danger
              disabled={frozen || busyParticipantId !== null}
              aria-label={t('Exclure {{name}}', { name: participant.name })}
              onClick={() => setRemoving(participant)}
            >
              {t('Exclure')}
            </Button>
          </Space>
        );
      }
    }
  ];

  return (
    <Card
      size="small"
      title={t('Visio intégrée')}
      extra={
        !frozen ? (
          <Button type={roomOpen ? 'default' : 'primary'} onClick={onToggleRoom}>
            {roomOpen ? t('Fermer la visio') : t('Ouvrir la visio')}
          </Button>
        ) : null
      }
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {recording?.enabled ? (
          <Space wrap align="center">
            {activeRecording ? (
              <>
                <Tag color="red" icon={<span aria-hidden="true">● </span>}>
                  {t('Enregistrement en cours')}
                </Tag>
                <Text type="secondary">
                  {t('depuis {{date}}', { date: formatDateTime(activeRecording.startedAt) })}
                </Text>
                <Button danger loading={recordingBusy} disabled={frozen} onClick={onStopRecording}>
                  {t("Arrêter l'enregistrement")}
                </Button>
              </>
            ) : (
              <Button loading={recordingBusy} disabled={frozen || !inProgress} onClick={onStartRecording}>
                {t('Enregistrer la séance')}
              </Button>
            )}
            {!activeRecording && !inProgress && !frozen ? (
              <Text type="secondary">{t("L'enregistrement démarre une fois la séance ouverte.")}</Text>
            ) : null}
          </Space>
        ) : null}

        {roomOpen && !frozen ? (
          <div style={{ height: 'min(70vh, 560px)', minHeight: 360 }}>
            <Suspense
              fallback={
                <div style={{ textAlign: 'center', padding: 32 }} role="status">
                  <Spin aria-label={t('Connexion à la visio…')} />
                </div>
              }
            >
              <MeetingVisioRoom role="moderator" getToken={getToken} title={t("Visio de l'assemblée")} />
            </Suspense>
          </div>
        ) : null}

        <Table<MeetingVisioParticipant>
          size="small"
          rowKey="identity"
          dataSource={sortVisioParticipants(visio.participants)}
          columns={columns}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{ emptyText: t("Personne n'est en visio pour le moment") }}
        />
      </Space>

      <Modal
        open={removing !== null}
        title={t('Exclure de la visio')}
        okText={t('Exclure')}
        cancelText={t('Annuler')}
        okButtonProps={{ danger: true, loading: removeBusy }}
        onOk={() => void confirmRemoval()}
        onCancel={closeRemoval}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text>
            {t('{{name}} sera retiré de la salle. Sans autre action, il pourra y revenir, mais sans la parole.', {
              name: removing?.name ?? ''
            })}
          </Text>
          <Checkbox checked={revokeLinks} onChange={event => setRevokeLinks(event.target.checked)}>
            {t('Révoquer aussi ses liens personnels')}
          </Checkbox>
        </Space>
      </Modal>
    </Card>
  );
};

export default MeetingVisioCard;
