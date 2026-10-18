import React, { Suspense, useState } from 'react';
import { Alert, Button, Card, Checkbox, Modal, Popconfirm, Space, Spin, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AudioMutedOutlined, AudioOutlined, BellFilled, StopOutlined, VideoCameraOutlined } from '@ant-design/icons';
import type {
  MeetingRecordingView,
  MeetingVisioAdminView,
  MeetingVisioParticipant,
  MeetingVisioTrackState,
  VisioJoinInfo
} from '../../../types/syndic-live-types';
import type { VisioMuteSource } from '../../../services/syndic-service';
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

/* ------------------------------------------------------- micro et caméra (V16) */

/** Droit de publier tel que décidé par le serveur ; repli sur `canSpeak` pour une API plus ancienne. */
export function isMediaAllowed(participant: MeetingVisioParticipant): boolean {
  return participant.mediaAllowed ?? participant.canSpeak;
}

interface TrackLabel {
  text: string;
  color?: string;
}

/** Libellé d'une piste : actif, coupé, interdit (aucune piste publiée) ou inactif. */
export function trackLabel(
  kind: 'mic' | 'camera',
  track: MeetingVisioTrackState | undefined,
  allowed: boolean
): TrackLabel {
  const name = kind === 'mic' ? t('Micro') : t('Caméra');
  if (track?.published) {
    return track.muted
      ? { text: t('{{name}} coupé', { name }), color: 'orange' }
      : { text: t('{{name}} actif', { name }), color: 'green' };
  }
  if (!allowed) return { text: t('{{name}} interdit', { name }), color: 'red' };
  return { text: t('{{name}} inactif', { name }) };
}

const MediaIndicator: React.FC<{ participant: MeetingVisioParticipant }> = ({ participant }) => {
  const allowed = isMediaAllowed(participant);
  const mic = trackLabel('mic', participant.mic, allowed);
  const camera = trackLabel('camera', participant.camera, allowed);
  return (
    <Space size={4} wrap>
      <Tag color={mic.color} icon={mic.color === 'green' ? <AudioOutlined /> : <AudioMutedOutlined />}>
        {mic.text}
      </Tag>
      <Tag color={camera.color} icon={camera.color === 'red' ? <StopOutlined /> : <VideoCameraOutlined />}>
        {camera.text}
      </Tag>
    </Space>
  );
};

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
  // AG figée : un `active` périmé (relu avant la fin du traitement) ne fait plus afficher « en cours ».
  if (!active || frozen) {
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
  /** Coupe les pistes publiées d'un participant (V16c). */
  onMute?: (participant: MeetingVisioParticipant, sources: VisioMuteSource[]) => void;
  /** Interdit ou rend micro et caméra à tous (V16d). */
  onLockMedia?: (locked: boolean) => void;
  lockBusy?: boolean;
  onRemove: (participant: MeetingVisioParticipant, revokeLinks: boolean) => Promise<void>;
  /** L'AG est en cours : seul moment où l'on peut démarrer un enregistrement. */
  inProgress?: boolean;
  recordingBusy?: boolean;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  /** Dernier enregistrement en échec, aucun n'étant actif : la séance n'est pas enregistrée. */
  failedRecording?: MeetingRecordingView | null;
  /** Enregistrement en cours d'après la liste, si `/visio` ne le signale pas (les deux lectures sont indépendantes). */
  listActiveRecording?: MeetingRecordingView | null;
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
  onMute?: MeetingVisioCardProps['onMute'],
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
          {participant.kind === 'COOWNER' && participant.chatMuted ? (
            <Tag color="volcano">{t('écriture coupée')}</Tag>
          ) : null}
        </Space>
      )
    },
    {
      title: t('Micro et caméra'),
      key: 'media',
      render: (_: unknown, participant) => <MediaIndicator participant={participant} />
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
        const allowed = isMediaAllowed(participant);
        return (
          <Space wrap>
            {onMute ? (
              <>
                <Button
                  size="small"
                  disabled={disabled || !participant.mic?.published || participant.mic.muted}
                  aria-label={t('Couper le micro de {{name}}', { name: participant.name })}
                  onClick={() => onMute(participant, ['MICROPHONE'])}
                >
                  {t('Couper le micro')}
                </Button>
                <Button
                  size="small"
                  disabled={disabled || !participant.camera?.published || participant.camera.muted}
                  aria-label={t('Couper la caméra de {{name}}', { name: participant.name })}
                  onClick={() => onMute(participant, ['CAMERA'])}
                >
                  {t('Couper la caméra')}
                </Button>
              </>
            ) : null}
            <Button
              size="small"
              type={allowed ? 'default' : 'primary'}
              disabled={disabled}
              loading={busyParticipantId === participant.participantId}
              aria-label={
                allowed
                  ? t('Interdire micro et caméra à {{name}}', { name: participant.name })
                  : t('Autoriser micro et caméra à {{name}}', { name: participant.name })
              }
              onClick={() => onSpeak(participant, !allowed)}
            >
              {allowed ? t('Interdire micro et caméra') : t('Autoriser micro et caméra')}
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
  onMute,
  onLockMedia,
  lockBusy = false,
  onRemove,
  inProgress = false,
  recordingBusy = false,
  onStartRecording,
  onStopRecording,
  failedRecording = null,
  listActiveRecording = null,
  discussion,
  onWriting,
  busyWritingParticipantId = null
}) => {
  const [removing, setRemoving] = useState<MeetingVisioParticipant | null>(null);
  const recording = visio.recording;
  const activeRecording = (recording?.enabled ? recording.active : null) ?? listActiveRecording;

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

        {recording?.enabled || activeRecording ? (
          <RecordingControls
            active={activeRecording}
            frozen={frozen}
            inProgress={inProgress}
            busy={recordingBusy}
            onStart={onStartRecording}
            onStop={onStopRecording}
          />
        ) : null}

        {onLockMedia ? (
          <Space wrap align="center">
            <Popconfirm
              title={
                visio.mediaLocked
                  ? t('Rendre les micros et les caméras à tous ?')
                  : t('Interdire les micros et les caméras à tous ?')
              }
              description={
                visio.mediaLocked
                  ? t(
                      'Les copropriétaires pourront de nouveau activer leur micro et leur caméra, sauf ceux interdits un par un.'
                    )
                  : t(
                      'Les copropriétaires présents seront coupés et ne pourront plus activer leur micro ni leur caméra. Ils gardent la main levée.'
                    )
              }
              okText={visio.mediaLocked ? t('Rendre les micros') : t('Interdire')}
              cancelText={t('Annuler')}
              disabled={frozen || lockBusy}
              onConfirm={() => onLockMedia(!visio.mediaLocked)}
            >
              <Switch
                checked={Boolean(visio.mediaLocked)}
                loading={lockBusy}
                disabled={frozen}
                aria-label={visio.mediaLocked ? t('Rendre les micros') : t('Interdire les micros à tous')}
              />
            </Popconfirm>
            <Text>{visio.mediaLocked ? t('Micros interdits à tous') : t('Interdire les micros à tous')}</Text>
            {visio.mediaLocked ? <Tag color="red">{t('Micros et caméras interdits')}</Tag> : null}
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
            onMute,
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
