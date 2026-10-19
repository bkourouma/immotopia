import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import {
  deleteMeetingRecording,
  downloadMeetingRecordingFile,
  getMeetingRecordings,
  getMeetingVisio,
  issueMeetingVisioToken,
  muteVisioParticipant,
  removeVisioParticipant,
  retryMeetingRecording,
  setVisioMediaLock,
  setVisioParticipantSpeaking,
  setVisioParticipantWriting,
  startMeetingRecording,
  stopMeetingRecording,
  type VisioMuteSource
} from '../../../services/syndic-service';
import type {
  MeetingRecordingView,
  MeetingVisioAdminView,
  MeetingVisioParticipant,
  VisioJoinInfo
} from '../../../types/syndic-live-types';
import type { MeetingStatus } from '../../../types/syndic-types';
import { liveBackoffDelay, useVisiblePolling } from '../../../hooks/useVisiblePolling';
import { t } from '../../../i18n/t';
import { saveBlob } from '../../../utils/save-blob';
import { describeDownloadError } from '../../../utils/download-error';

/** Délai entre deux lectures de la liste tant qu'un enregistrement est en cours ou en traitement. */
export const RECORDING_POLL_INTERVAL_MS = 5000;
/** Au-delà, un enregistrement encore `PROCESSING` n'est plus interrogé : on prévient le gestionnaire. */
export const RECORDING_PROCESSING_MAX_MS = 10 * 60 * 1000;
/** Délai de relecture de `/visio` tant que la visio n'est pas connue (409) pendant la séance. */
export const VISIO_RETRY_INTERVAL_MS = 10000;

/** Message d'erreur renvoyé par l'API (`error`), sinon le texte de repli. */
export function apiErrorText(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof message === 'string' && message ? message : fallback;
}

interface MeetingScope {
  tenantId: string;
  syndicId: string;
  meetingId: string;
  meetingStatus: MeetingStatus;
}

/* --------------------------------------------------------------------- visio */

interface UseMeetingVisioOptions extends MeetingScope {
  /** Liens personnels révoqués par une exclusion : la console relit ses participants. */
  onLinksRevoked: () => void;
}

/**
 * Visio intégrée de l'AG (spec 045) côté gestionnaire : lecture de `/visio` toutes les
 * 5 s pendant la séance, jeton du modérateur, parole et exclusion.
 */
export function useMeetingVisio({
  tenantId,
  syndicId,
  meetingId,
  meetingStatus,
  onLinksRevoked
}: UseMeetingVisioOptions) {
  const { message } = App.useApp();
  const [visio, setVisio] = useState<MeetingVisioAdminView | null>(null);
  const [busyVisioId, setBusyVisioId] = useState<string | null>(null);
  const [busyWritingId, setBusyWritingId] = useState<string | null>(null);
  const [lockBusy, setLockBusy] = useState(false);
  const inProgress = meetingStatus === 'IN_PROGRESS';

  // Compte les actions du gestionnaire : une lecture partie avant l'une d'elles est périmée et ne l'écrase pas.
  const writeSeqRef = useRef(0);
  const refreshRef = useRef<() => void>(() => undefined);

  const visioRef = useRef<MeetingVisioAdminView | null>(null);
  // Échecs consécutifs de la lecture : attente croissante plutôt que 503 en rafale.
  const visioFailuresRef = useRef(0);
  const [visioError, setVisioError] = useState(false);

  const loadVisio = useCallback(async (): Promise<number | false | void> => {
    const seq = writeSeqRef.current;
    try {
      const view = await getMeetingVisio(tenantId, syndicId, meetingId);
      visioFailuresRef.current = 0;
      if (seq !== writeSeqRef.current) {
        // Une action est passée entre-temps : cette lecture est relue plutôt qu'appliquée.
        refreshRef.current();
      } else if (!view.enabled && visioRef.current?.enabled) {
        // La configuration ne change pas en pleine séance : une réponse « désactivée » est un accident
        // passager. On garde la vue connue (la salle ouverte ne doit pas être démontée) et on signale.
        setVisioError(true);
      } else {
        // Vue dégradée (l'API n'a pas pu relire la salle) : on garde les derniers participants et
        // enregistrement connus plutôt que d'afficher une salle vide.
        const previous = visioRef.current;
        const next: MeetingVisioAdminView = view.degraded && previous?.enabled ? { ...previous, degraded: true } : view;
        visioRef.current = next;
        setVisio(next);
        setVisioError(false);
        // Contrat : 200 `enabled: false` quand LiveKit n'est pas configuré, rien à surveiller.
        if (!view.enabled) return false;
      }
    } catch (err) {
      // 409 « visio non activée » (API plus ancienne) : rien à afficher tant qu'aucune vue n'a été reçue.
      // Une fois la visio connue, c'est un incident passager comme un autre (jamais d'effacement de la vue).
      if ((err as { response?: { status?: number } })?.response?.status === 409 && !visioRef.current?.enabled) {
        visioRef.current = null;
        setVisio(null);
        setVisioError(false);
        return inProgress ? VISIO_RETRY_INTERVAL_MS : false;
      }
      // Échec passager : on garde les dernières données, on le signale et on réessaie.
      setVisioError(inProgress);
      visioFailuresRef.current += 1;
      return inProgress ? liveBackoffDelay(visioFailuresRef.current) : false;
    }
    return inProgress ? undefined : false;
  }, [tenantId, syndicId, meetingId, inProgress]);

  const { refresh: refreshVisio } = useVisiblePolling(loadVisio, { resetKey: meetingStatus });
  refreshRef.current = refreshVisio;

  const inVisioContactIds = useMemo(
    () =>
      new Set(
        (visio?.participants ?? []).flatMap(participant => (participant.contactId ? [participant.contactId] : []))
      ),
    [visio]
  );

  const getToken = useCallback(async (): Promise<VisioJoinInfo> => {
    try {
      return await issueMeetingVisioToken(tenantId, syndicId, meetingId);
    } catch (err) {
      throw new Error(apiErrorText(err, t("Impossible d'ouvrir la visio, réessayez.")));
    }
  }, [tenantId, syndicId, meetingId]);

  const speak = async (participant: MeetingVisioParticipant, allowed: boolean) => {
    if (!participant.participantId) return;
    setBusyVisioId(participant.participantId);
    writeSeqRef.current += 1;
    try {
      const updated = await setVisioParticipantSpeaking(
        tenantId,
        syndicId,
        meetingId,
        participant.participantId,
        allowed
      );
      writeSeqRef.current += 1;
      visioRef.current = updated;
      setVisio(updated);
      message.success(
        allowed
          ? t('Micro et caméra autorisés pour {{name}}', { name: participant.name })
          : t('Micro et caméra interdits à {{name}}', { name: participant.name })
      );
    } catch (err) {
      message.error(apiErrorText(err, t('Action impossible, réessayez.')));
      writeSeqRef.current += 1;
      refreshVisio();
    } finally {
      setBusyVisioId(null);
    }
  };

  /** Coupe le micro et/ou la caméra publiés d'un participant (V16c) ; il peut les rouvrir. */
  const mute = async (participant: MeetingVisioParticipant, sources: VisioMuteSource[]) => {
    if (!participant.participantId) return;
    setBusyVisioId(participant.participantId);
    writeSeqRef.current += 1;
    const label =
      sources.length === 1 && sources[0] === 'MICROPHONE'
        ? t('Micro de {{name}} coupé', { name: participant.name })
        : sources.length === 1
          ? t('Caméra de {{name}} coupée', { name: participant.name })
          : t('Micro et caméra de {{name}} coupés', { name: participant.name });
    try {
      const { mutedTracks, ...view } = await muteVisioParticipant(
        tenantId,
        syndicId,
        meetingId,
        participant.participantId,
        sources
      );
      writeSeqRef.current += 1;
      visioRef.current = view;
      setVisio(view);
      if (mutedTracks > 0) message.success(label);
      else message.info(t('Rien à couper : {{name}} ne diffuse pas.', { name: participant.name }));
    } catch (err) {
      message.error(apiErrorText(err, t('Action impossible, réessayez.')));
      writeSeqRef.current += 1;
      refreshVisio();
    } finally {
      setBusyVisioId(null);
    }
  };

  /** Interdit (`locked: true`) ou rend micro et caméra à tous les copropriétaires (V16d). */
  const lockMedia = async (locked: boolean) => {
    setLockBusy(true);
    writeSeqRef.current += 1;
    try {
      const updated = await setVisioMediaLock(tenantId, syndicId, meetingId, locked);
      writeSeqRef.current += 1;
      visioRef.current = updated;
      setVisio(updated);
      message.success(locked ? t('Micros et caméras interdits à tous') : t('Micros et caméras rendus à tous'));
    } catch (err) {
      message.error(apiErrorText(err, t('Action impossible, réessayez.')));
      writeSeqRef.current += 1;
      refreshVisio();
    } finally {
      setLockBusy(false);
    }
  };

  /** Coupe (`allowed: false`) ou rétablit l'écriture d'un copropriétaire dans la discussion (spec 046, M6). */
  const writing = async (participant: MeetingVisioParticipant, allowed: boolean) => {
    if (!participant.participantId) return;
    setBusyWritingId(participant.participantId);
    writeSeqRef.current += 1;
    try {
      await setVisioParticipantWriting(tenantId, syndicId, meetingId, participant.participantId, allowed);
      message.success(
        allowed
          ? t('Écriture rétablie pour {{name}}', { name: participant.name })
          : t('Écriture coupée pour {{name}}', { name: participant.name })
      );
    } catch (err) {
      message.error(apiErrorText(err, t('Action impossible, réessayez.')));
    } finally {
      setBusyWritingId(null);
      writeSeqRef.current += 1;
      refreshVisio();
    }
  };

  /** Exclut le participant ; en cas d'échec l'erreur remonte à la modale, qui reste ouverte. */
  const remove = async (participant: MeetingVisioParticipant, revokeLinks: boolean) => {
    if (!participant.participantId) return;
    writeSeqRef.current += 1;
    try {
      const { revokedLinks, ...view } = await removeVisioParticipant(
        tenantId,
        syndicId,
        meetingId,
        participant.participantId,
        revokeLinks
      );
      writeSeqRef.current += 1;
      visioRef.current = view;
      setVisio(view);
      message.success(
        revokeLinks
          ? t('{{name}} a été exclu — {{count}} lien(s) révoqué(s)', { name: participant.name, count: revokedLinks })
          : t('{{name}} a été exclu', { name: participant.name })
      );
      if (revokeLinks) onLinksRevoked();
    } catch (err) {
      writeSeqRef.current += 1;
      refreshVisio();
      throw new Error(apiErrorText(err, t('Exclusion impossible, réessayez.')));
    }
  };

  return {
    visio,
    visioError,
    visioEnabled: visio?.enabled === true,
    recordingConfigured: visio?.enabled === true && visio.recording?.enabled === true,
    activeRecording: visio?.recording?.enabled ? (visio.recording.active ?? null) : null,
    inProgress,
    refreshVisio,
    busyVisioId,
    busyWritingId,
    lockBusy,
    inVisioContactIds,
    getToken,
    speak,
    mute,
    lockMedia,
    writing,
    remove
  };
}

/* ------------------------------------------------------------ enregistrements */

interface UseMeetingRecordingsOptions extends MeetingScope {
  /** Interroge la liste. Indépendante de `/visio` : l'arrêt manuel doit rester possible si cette lecture échoue. */
  enabled: boolean;
  /** Identifiant de l'enregistrement actif lu dans `/visio` ; un changement relit la liste. */
  activeId: string | null;
  /** Relit `/visio` (voyant, bouton) après une action. */
  onChanged: () => void;
}

/** Enregistrements de l'AG (R6) : liste, interrogation bornée, démarrage, arrêt, suppression, reprise. */
export function useMeetingRecordings({
  tenantId,
  syndicId,
  meetingId,
  meetingStatus,
  enabled,
  activeId,
  onChanged
}: UseMeetingRecordingsOptions) {
  const { message } = App.useApp();
  const [recordings, setRecordings] = useState<MeetingRecordingView[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyRecordingId, setBusyRecordingId] = useState<string | null>(null);
  const [processingSlow, setProcessingSlow] = useState(false);
  const firstSeenProcessing = useRef(new Map<string, number>());

  const load = useCallback(async (): Promise<number | false | void> => {
    try {
      const read = await getMeetingRecordings(tenantId, syndicId, meetingId);
      // Garde-fou : une réponse inattendue (API plus ancienne) ne doit pas faire tomber la console.
      const list = Array.isArray(read) ? read : [];
      setRecordings(list);
      const now = Date.now();
      let recording = false;
      let processingFresh = false;
      let processingStale = false;
      for (const item of list) {
        if (item.status === 'RECORDING') recording = true;
        if (item.status !== 'PROCESSING') continue;
        const first = firstSeenProcessing.current.get(item.id) ?? now;
        firstSeenProcessing.current.set(item.id, first);
        const since = Date.parse(item.endedAt ?? item.stoppedAt ?? '');
        const age = now - (Number.isFinite(since) ? since : first);
        if (age > RECORDING_PROCESSING_MAX_MS) processingStale = true;
        else processingFresh = true;
      }
      setProcessingSlow(processingStale);
      return recording || processingFresh ? RECORDING_POLL_INTERVAL_MS : false;
    } catch (err) {
      // Droit manquant ou route absente : inutile de réessayer. Sinon échec passager, on garde la liste.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== undefined && status >= 400 && status < 500 && status !== 429) return false;
      return RECORDING_POLL_INTERVAL_MS * 2;
    }
  }, [tenantId, syndicId, meetingId]);

  const { refresh } = useVisiblePolling(load, { enabled, resetKey: meetingStatus });

  // Une autre session a démarré ou arrêté l'enregistrement : la liste est relue.
  const lastActiveId = useRef(activeId);
  useEffect(() => {
    if (lastActiveId.current === activeId) return;
    lastActiveId.current = activeId;
    refresh();
    // `refresh` délègue à une référence stable : inutile de relancer l'effet pour lui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const toggle = async (start: boolean) => {
    setBusy(true);
    try {
      await (start ? startMeetingRecording : stopMeetingRecording)(tenantId, syndicId, meetingId);
      message.success(start ? t('Enregistrement démarré') : t('Enregistrement arrêté'));
    } catch (err) {
      message.error(
        apiErrorText(
          err,
          start ? t("Impossible de démarrer l'enregistrement") : t("Impossible d'arrêter l'enregistrement")
        )
      );
    } finally {
      setBusy(false);
      onChanged();
      refresh();
    }
  };

  const act = async (recording: MeetingRecordingView, run: () => Promise<unknown>, ok: string, fail: string) => {
    setBusyRecordingId(recording.id);
    try {
      await run();
      message.success(ok);
    } catch (err) {
      message.error(apiErrorText(err, fail));
    } finally {
      setBusyRecordingId(null);
      refresh();
    }
  };

  /** Téléchargement par l'API (blob) : message de progression, puis nom du fichier ou erreur. */
  const download = async (recording: MeetingRecordingView) => {
    const key = `recording-download-${recording.id}`;
    setBusyRecordingId(recording.id);
    message.loading({ content: t("Téléchargement de l'enregistrement en cours…"), key, duration: 0 });
    try {
      const fallbackName = t('AG-{{value}}.mp4', { value: recording.startedAt.slice(0, 10) });
      const { blob, filename } = await downloadMeetingRecordingFile(
        tenantId,
        syndicId,
        meetingId,
        recording.id,
        fallbackName
      );
      saveBlob(blob, filename);
      message.success({ content: t('Enregistrement téléchargé : {{filename}}', { filename }), key, duration: 5 });
    } catch (err) {
      message.error({ content: await describeDownloadError(err), key, duration: 6 });
    } finally {
      setBusyRecordingId(null);
    }
  };

  const remove = (recording: MeetingRecordingView) =>
    act(
      recording,
      () => deleteMeetingRecording(tenantId, syndicId, meetingId, recording.id),
      t('Enregistrement supprimé'),
      t("Suppression de l'enregistrement impossible")
    );

  const retry = (recording: MeetingRecordingView) =>
    act(
      recording,
      () => retryMeetingRecording(tenantId, syndicId, meetingId, recording.id),
      t('Traitement relancé'),
      t("Impossible de relancer le traitement de l'enregistrement")
    );

  // Le dernier enregistrement a échoué et aucun n'est actif : la séance n'est PAS enregistrée.
  // Enregistrement réellement en cours d'après la liste (indépendante de `/visio`).
  const listActive = recordings.find(item => item.status === 'RECORDING') ?? null;
  const latestFailed = activeId === null && recordings[0]?.status === 'FAILED' ? recordings[0] : null;

  return {
    recordings,
    listActive,
    busy,
    busyRecordingId,
    processingSlow,
    latestFailed,
    download,
    start: () => toggle(true),
    stop: () => toggle(false),
    remove,
    retry
  };
}
