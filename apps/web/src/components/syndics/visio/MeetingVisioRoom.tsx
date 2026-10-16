import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Space, Spin, Tag, Typography } from 'antd';
import { BellFilled, BellOutlined, LogoutOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useDataChannel,
  useIsRecording,
  useLocalParticipant,
  useLocalParticipantPermissions,
  useParticipantAttribute,
  useRoomContext,
  useTrackRefContext,
  useTracks
} from '@livekit/components-react';
import { DisconnectReason, MediaDeviceFailure, Track } from 'livekit-client';
import '@livekit/components-styles';
import type { VisioJoinInfo } from '../../../types/syndic-live-types';
import { t } from '../../../i18n/t';

const { Text } = Typography;

/** Attribut LiveKit posé par le serveur : horodatage ISO de la main levée, vide si baissée. */
export const HAND_ATTRIBUTE = 'main_levee';
/** Sujet du message de données envoyé par le serveur à l'ouverture et à la clôture d'un vote. */
export const REFRESH_TOPIC = 'ag-refresh';

export interface MeetingVisioRoomProps {
  role: 'moderator' | 'participant';
  /** Obtient un jeton de connexion : appelé au montage et sur « Revenir dans la visio ». */
  getToken: () => Promise<VisioJoinInfo>;
  /** Participant : lève ou baisse la main (le serveur pose l'attribut `main_levee`). */
  onRaiseHand?: (raised: boolean) => Promise<void>;
  /** Appelé quand le serveur signale l'ouverture ou la clôture d'un vote. */
  onRefreshSignal?: () => void;
  /** Appelé quand la connexion à la salle prend fin, quelle qu'en soit la raison. */
  onLeave?: () => void;
  title?: string;
}

type EndReason = 'removed' | 'ended' | 'left';

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'connected'; info: VisioJoinInfo }
  | { kind: 'ended'; reason: EndReason };

function endReasonFor(reason: DisconnectReason | undefined): EndReason {
  if (reason === DisconnectReason.PARTICIPANT_REMOVED) return 'removed';
  if (reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.ROOM_CLOSED) return 'ended';
  return 'left';
}

function endMessage(reason: EndReason): string {
  if (reason === 'removed') return t('Vous avez été retiré de la visio par le gestionnaire.');
  if (reason === 'ended') return t('La visio est terminée.');
  return t('Vous avez quitté la visio.');
}

function deviceFailureMessage(failure?: MediaDeviceFailure): string {
  if (failure === MediaDeviceFailure.PermissionDenied) {
    return t(
      "L'accès au micro ou à la caméra a été refusé. Autorisez-le dans les réglages du navigateur pour ce site, puis réessayez."
    );
  }
  if (failure === MediaDeviceFailure.NotFound) {
    return t('Aucun micro ou aucune caméra détecté sur cet appareil.');
  }
  if (failure === MediaDeviceFailure.DeviceInUse) {
    return t('Le micro ou la caméra est utilisé par une autre application.');
  }
  return t("Le micro ou la caméra n'est pas utilisable pour le moment.");
}

function errorMessage(err: unknown): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.trim()
    ? message
    : t("Impossible d'obtenir l'accès à la visio, réessayez.");
}

const CONTAINER_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  background: '#0b0d12',
  color: '#f5f5f5',
  borderRadius: 8,
  overflow: 'hidden'
};

/* ------------------------------------------------------------- tuile et main */

/** Tuile de participant décorée d'une pastille « main levée » propre à ce participant. */
const TileWithHand: React.FC = () => {
  const trackRef = useTrackRefContext();
  const raisedAt = useParticipantAttribute(HAND_ATTRIBUTE, { participant: trackRef.participant });
  return (
    <div style={{ position: 'relative', minWidth: 0, minHeight: 0, height: '100%' }}>
      <ParticipantTile style={{ height: '100%' }} />
      {raisedAt ? (
        <Tag
          color="gold"
          icon={<BellFilled />}
          style={{ position: 'absolute', insetBlockStart: 8, insetInlineEnd: 8, margin: 0 }}
        >
          {t('Main levée')}
        </Tag>
      ) : null}
    </div>
  );
};

const RAISE_PENDING_MS = 4000;

const HandButton: React.FC<{ onRaiseHand: (raised: boolean) => Promise<void> }> = ({ onRaiseHand }) => {
  const { localParticipant } = useLocalParticipant();
  const raisedAt = useParticipantAttribute(HAND_ATTRIBUTE, { participant: localParticipant });
  const [pending, setPending] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const serverRaised = Boolean(raisedAt);
  const raised = pending ?? serverRaised;

  useEffect(() => () => clearTimeout(timer.current), []);
  // Le serveur a rattrapé l'état attendu : l'affichage optimiste n'a plus lieu d'être.
  useEffect(() => {
    if (pending !== null && pending === serverRaised) setPending(null);
  }, [pending, serverRaised]);

  const toggle = async () => {
    const next = !raised;
    setFailed(false);
    setPending(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPending(null), RAISE_PENDING_MS);
    try {
      await onRaiseHand(next);
    } catch {
      clearTimeout(timer.current);
      setPending(null);
      setFailed(true);
    }
  };

  return (
    <Space size={8} wrap>
      <Button
        icon={raised ? <BellFilled /> : <BellOutlined />}
        type={raised ? 'primary' : 'default'}
        aria-pressed={raised}
        onClick={() => void toggle()}
      >
        {raised ? t('Baisser la main') : t('Lever la main')}
      </Button>
      {failed ? <Text type="danger">{t('Action impossible, réessayez.')}</Text> : null}
    </Space>
  );
};

/* -------------------------------------------------------------------- salle */

interface RoomShellProps {
  role: 'moderator' | 'participant';
  title?: string;
  deviceError: string | null;
  onDismissDeviceError: () => void;
  onRaiseHand?: (raised: boolean) => Promise<void>;
  onRefreshSignal?: () => void;
}

const RoomShell: React.FC<RoomShellProps> = ({
  role,
  title,
  deviceError,
  onDismissDeviceError,
  onRaiseHand,
  onRefreshSignal
}) => {
  const room = useRoomContext();
  const permissions = useLocalParticipantPermissions();
  const canPublish = Boolean(permissions?.canPublish);
  // État tenu par LiveKit : l'avis suit l'enregistrement réel, pour le modérateur comme pour le participant.
  const recording = useIsRecording();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  );

  const refreshRef = useRef(onRefreshSignal);
  refreshRef.current = onRefreshSignal;
  // Seul le serveur peut signaler un vote : un message venant d'un participant est ignoré.
  useDataChannel(REFRESH_TOPIC, message => {
    if (message.from) return;
    try {
      const payload = JSON.parse(new TextDecoder().decode(message.payload)) as { type?: unknown };
      if (payload?.type === 'refresh') refreshRef.current?.();
    } catch {
      // Message illisible : ignoré.
    }
  });

  return (
    <div style={{ ...CONTAINER_STYLE, borderRadius: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 12px',
          borderBlockEnd: '1px solid #262a33'
        }}
      >
        <Space size={8}>
          <Text strong style={{ color: 'inherit' }}>
            {title ?? t("Visio de l'assemblée")}
          </Text>
          <Tag style={{ margin: 0 }}>{role === 'moderator' ? t('Gestionnaire') : t('Participant')}</Tag>
        </Space>
        <Button size="small" danger icon={<LogoutOutlined />} onClick={() => room.disconnect()}>
          {t('Quitter la visio')}
        </Button>
      </div>

      {recording ? <Alert type="warning" showIcon banner message={t('Cette assemblée est enregistrée.')} /> : null}

      {deviceError ? (
        <Alert type="warning" showIcon closable onClose={onDismissDeviceError} message={deviceError} />
      ) : null}

      <div style={{ flex: 1, minHeight: 0 }}>
        <GridLayout tracks={tracks}>
          <TileWithHand />
        </GridLayout>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          padding: '8px 12px',
          borderBlockStart: '1px solid #262a33'
        }}
      >
        {role === 'participant' && onRaiseHand ? <HandButton onRaiseHand={onRaiseHand} /> : <span />}
        <ControlBar
          variation="minimal"
          saveUserChoices={false}
          controls={{
            microphone: canPublish,
            camera: canPublish,
            screenShare: role === 'moderator' && canPublish,
            chat: false,
            leave: false,
            settings: false
          }}
        />
      </div>
      <RoomAudioRenderer />
    </div>
  );
};

/**
 * Salle de visio de l'AG en direct (spec 045), portée du composant de classes en
 * direct d'École Digitale. Chargée par `React.lazy` : `livekit-client` n'entre pas
 * dans le paquet initial. La hauteur vient du parent (`height: 100%`).
 */
export const MeetingVisioRoom: React.FC<MeetingVisioRoomProps> = ({
  role,
  getToken,
  onRaiseHand,
  onRefreshSignal,
  onLeave,
  title
}) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  const requestRef = useRef(0);
  const liveRef = useRef(false);
  const connectedRef = useRef(false);

  const connect = useCallback(async () => {
    const request = ++requestRef.current;
    setPhase({ kind: 'loading' });
    setDeviceError(null);
    try {
      const info = await getTokenRef.current();
      if (request !== requestRef.current) return;
      liveRef.current = true;
      connectedRef.current = false;
      setPhase({ kind: 'connected', info });
    } catch (err) {
      if (request !== requestRef.current) return;
      setPhase({ kind: 'error', message: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void connect();
    // Invalide toute demande de jeton en vol : le composant n'est plus là.
    const invalidate = () => {
      requestRef.current += 1;
      liveRef.current = false;
    };
    return invalidate;
  }, [connect]);

  const handleDisconnected = (reason?: DisconnectReason) => {
    // Une déconnexion déjà traitée (ou provoquée par notre propre démontage) ne repasse pas par ici.
    if (!liveRef.current) return;
    liveRef.current = false;
    setPhase({ kind: 'ended', reason: endReasonFor(reason) });
    onLeaveRef.current?.();
  };

  const handleError = () => {
    // Une erreur avant la connexion : la salle n'est pas joignable. Après, LiveKit reconnecte seul.
    if (!liveRef.current || connectedRef.current) return;
    liveRef.current = false;
    setPhase({ kind: 'error', message: t('Connexion à la visio impossible, réessayez.') });
  };

  if (phase.kind === 'loading') {
    return (
      <div style={{ ...CONTAINER_STYLE, alignItems: 'center', justifyContent: 'center' }} role="status">
        <Space direction="vertical" align="center">
          <Spin />
          <Text style={{ color: 'inherit' }}>{t('Connexion à la visio…')}</Text>
        </Space>
      </div>
    );
  }

  if (phase.kind === 'error') {
    return (
      <Alert
        type="error"
        showIcon
        message={phase.message}
        action={
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void connect()}>
            {t('Réessayer')}
          </Button>
        }
      />
    );
  }

  if (phase.kind === 'ended') {
    return (
      <Alert
        type={phase.reason === 'removed' ? 'warning' : 'info'}
        showIcon
        message={endMessage(phase.reason)}
        action={
          <Button size="small" type="primary" onClick={() => void connect()}>
            {t('Revenir dans la visio')}
          </Button>
        }
      />
    );
  }

  const { info } = phase;
  return (
    <div style={CONTAINER_STYLE}>
      <LiveKitRoom
        serverUrl={info.serverUrl}
        token={info.token}
        connect
        audio={false}
        video={false}
        data-lk-theme="default"
        style={{ height: '100%' }}
        onConnected={() => {
          connectedRef.current = true;
        }}
        onDisconnected={handleDisconnected}
        onError={handleError}
        onMediaDeviceFailure={failure => setDeviceError(deviceFailureMessage(failure))}
      >
        <RoomShell
          role={role}
          title={title}
          deviceError={deviceError}
          onDismissDeviceError={() => setDeviceError(null)}
          onRaiseHand={onRaiseHand}
          onRefreshSignal={onRefreshSignal}
        />
      </LiveKitRoom>
    </div>
  );
};

export default MeetingVisioRoom;
