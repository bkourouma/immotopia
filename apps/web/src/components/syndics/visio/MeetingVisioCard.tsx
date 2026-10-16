import React, { Suspense, useState } from 'react';
import { Alert, Button, Card, Checkbox, Modal, Space, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BellFilled } from '@ant-design/icons';
import type {
  MeetingRecordingView,
  MeetingVisioAdminView,
  MeetingVisioParticipant,
  VisioJoinInfo
} from '../../../types/syndic-live-types';
import { formatDateTime } from '../live/live-labels';
import type { VisioDiscussionAdapter } from './use-visio-discussion';
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

/* ------------------------------------------------------- enregistrement (R1-R2) */

interface RecordingControlsProps {
  active: MeetingRecordingView | null;
  frozen: boolean;
  inProgress: boolean;
  busy: boolean;
  onStart?: () => void;
  onStop?: () => void;
}

/** Voyant « Enregistrement en cours » et bouton démarrer / arrêter. */
const RecordingControls: React.FC<RecordingControlsProps> = ({ active, frozen, inProgress, busy, onStart, onStop }) => {
  if (!active) {
    return (
      <Space wrap align="center">
        <Button loading={busy} disabled={frozen || !inProgress} onClick={onStart}>
          {t('Enregistrer la séance')}
        </Button>
        {!inProgress && !frozen ? (
          <Text type="secondary">{t("L'enregistrement démarre une fois la séance ouverte.")}</Text>
        ) : null}
      </Space>
    );
  }
  // L'arrêt est demandé (ici ou depuis une autre session) : le fichier est en cours de finalisation.
  const stopping = Boolean(active.stoppedAt);
  return (
    <Space wrap align="center">
      <Tag color="red" icon={<span aria-hidden="true">● </span>}>
        {t('Enregistrement en cours')}
      </Tag>
      <Text type="secondary">{t('depuis {{date}}', { date: formatDateTime(active.startedAt) })}</Text>
      <Button danger loading={busy} disabled={frozen || stopping} onClick={onStop}>
        {stopping ? t('Arrêt en cours…') : t("Arrêter l'enregistrement")}
      </Button>
    </Space>
  );
};

/* ------------------------------------------------------------------ exclusion */

interface RemoveModalProps {
  participant: MeetingVisioParticipant | null;
  onConfirm: (participant: MeetingVisioParticipant, revokeLinks: boolean) => Promise<void>;
  onClose: () => void;
}

/** Confirmation d'exclusion : en cas d'échec la modale reste ouverte avec l'erreur. */
const RemoveModal: React.FC<RemoveModalProps> = ({ participant, onConfirm, onClose }) => {
  const [revokeLinks, setRevokeLinks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setRevokeLinks(false);
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (!participant) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(participant, revokeLinks);
      close();
    } catch (err) {
      setError((err as Error)?.message || t('Exclusion impossible, réessayez.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={participant !== null}
      title={t('Exclure de la visio')}
      okText={t('Exclure')}
      cancelText={t('Annuler')}
      okButtonProps={{ danger: true, loading: busy }}
      onOk={() => void confirm()}
      onCancel={close}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Text>
          {t('{{name}} sera retiré de la salle. Sans autre action, il pourra y revenir, mais sans la parole.', {
            name: participant?.name ?? ''
          })}
        </Text>
        <Checkbox checked={revokeLinks} onChange={event => setRevokeLinks(event.target.checked)}>
          {t('Révoquer aussi ses liens personnels')}
        </Checkbox>
        {error ? <Alert type="error" showIcon message={error} /> : null}
      </Space>
    </Modal>
  );
};

/* ----------------------------------------------------------------------- carte */

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
  /** Dernier enregistrement en échec, aucun n'étant actif : la séance n'est pas enregistrée. */
  failedRecording?: MeetingRecordingView | null;
  /** Discussion écrite de la salle (spec 046) ; absente : la salle n'a pas de panneau. */
  discussion?: VisioDiscussionAdapter;
  /** Coupe ou rétablit l'écriture d'un copropriétaire dans la discussion. */
  onWriting?: (participant: MeetingVisioParticipant, allowed: boolean) => void;
  busyWritingParticipantId?: string | null;
}

function participantColumns(
  frozen: boolean,
  busyParticipantId: string | null,
  onSpeak: MeetingVisioCardProps['onSpeak'],
  onAskRemove: (participant: MeetingVisioParticipant) => void,
  onWriting?: MeetingVisioCardProps['onWriting'],
  busyWritingParticipantId: string | null = null
): ColumnsType<MeetingVisioParticipant> {
  return [
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
          {participant.kind === 'COOWNER' && participant.chatMuted ? (
            <Tag color="volcano">{t('écriture coupée')}</Tag>
          ) : null}
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
        const disabled = frozen || busyParticipantId !== null || busyWritingParticipantId !== null;
        return (
          <Space wrap>
            <Button
              size="small"
              type={participant.canSpeak ? 'default' : 'primary'}
              disabled={disabled}
              loading={busyParticipantId === participant.participantId}
              aria-label={
                participant.canSpeak
                  ? t('Retirer la parole à {{name}}', { name: participant.name })
                  : t('Donner la parole à {{name}}', { name: participant.name })
              }
              onClick={() => onSpeak(participant, !participant.canSpeak)}
            >
              {participant.canSpeak ? t('Retirer la parole') : t('Donner la parole')}
            </Button>
            {onWriting ? (
              <Button
                size="small"
                disabled={disabled}
                loading={busyWritingParticipantId === participant.participantId}
                aria-label={
                  participant.chatMuted
                    ? t("Rétablir l'écriture de {{name}}", { name: participant.name })
                    : t("Couper l'écriture de {{name}}", { name: participant.name })
                }
                onClick={() => onWriting(participant, Boolean(participant.chatMuted))}
              >
                {participant.chatMuted ? t("Rétablir l'écriture") : t("Couper l'écriture")}
              </Button>
            ) : null}
            <Button
              size="small"
              danger
              disabled={disabled}
              aria-label={t('Exclure {{name}}', { name: participant.name })}
              onClick={() => onAskRemove(participant)}
            >
              {t('Exclure')}
            </Button>
          </Space>
        );
      }
    }
  ];
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
  onStopRecording,
  failedRecording = null,
  discussion,
  onWriting,
  busyWritingParticipantId = null
}) => {
  const [removing, setRemoving] = useState<MeetingVisioParticipant | null>(null);
  const recording = visio.recording;
  const activeRecording = recording?.enabled ? recording.active : null;

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
        {failedRecording ? (
          <Alert
            type="error"
            showIcon
            message={t("L'enregistrement a échoué : cette séance n'est pas enregistrée.")}
            description={failedRecording.failureReason}
          />
        ) : null}

        {recording?.enabled ? (
          <RecordingControls
            active={activeRecording}
            frozen={frozen}
            inProgress={inProgress}
            busy={recordingBusy}
            onStart={onStartRecording}
            onStop={onStopRecording}
          />
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
              <MeetingVisioRoom
                role="moderator"
                getToken={getToken}
                title={t("Visio de l'assemblée")}
                discussion={discussion}
              />
            </Suspense>
          </div>
        ) : null}

        <Table<MeetingVisioParticipant>
          size="small"
          rowKey="identity"
          dataSource={sortVisioParticipants(visio.participants)}
          columns={participantColumns(
            frozen,
            busyParticipantId,
            onSpeak,
            setRemoving,
            onWriting,
            busyWritingParticipantId
          )}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{ emptyText: t("Personne n'est en visio pour le moment") }}
        />
      </Space>

      <RemoveModal participant={removing} onConfirm={onRemove} onClose={() => setRemoving(null)} />
    </Card>
  );
};

export default MeetingVisioCard;
