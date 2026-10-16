import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import {
  deleteMeetingRecording,
  getMeetingRecordings,
  getMeetingVisio,
  issueMeetingVisioToken,
  removeVisioParticipant,
  retryMeetingRecording,
  setVisioParticipantSpeaking,
  setVisioParticipantWriting,
  startMeetingRecording,
  stopMeetingRecording
} from '../../../services/syndic-service';
import type {
  MeetingRecordingView,
  MeetingVisioAdminView,
  MeetingVisioParticipant,
  VisioJoinInfo
} from '../../../types/syndic-live-types';
import type { MeetingStatus } from '../../../types/syndic-types';
import { useVisiblePolling } from '../../../hooks/useVisiblePolling';
import { t } from '../../../i18n/t';

/** Délai entre deux lectures de la liste tant qu'un enregistrement est en cours ou en traitement. */
export const RECORDING_POLL_INTERVAL_MS = 5000;
/** Au-delà, un enregistrement encore `PROCESSING` n'est plus interrogé : on prévient le gestionnaire. */
export const RECORDING_PROCESSING_MAX_MS = 10 * 60 * 1000;

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
 * 3 s pendant la séance, jeton du modérateur, parole et exclusion.
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
  const inProgress = meetingStatus === 'IN_PROGRESS';

  const loadVisio = useCallback(async (): Promise<number | false | void> => {
    try {
      const view = await getMeetingVisio(tenantId, syndicId, meetingId);
      setVisio(view);
      // Contrat : 200 `enabled: false` quand LiveKit n'est pas configuré, rien à surveiller.
      if (!view.enabled) return false;
    } catch (err) {
      // Compatibilité avec une API plus ancienne, qui répondait 409 « visio non activée ».
      if ((err as { response?: { status?: number } })?.response?.status === 409) {
        setVisio(null);
        return false;
      }
      // Échec passager : on garde les dernières données et on réessaie.
    }
    return inProgress ? undefined : false;
  }, [tenantId, syndicId, meetingId, inProgress]);

  const { refresh: refreshVisio } = useVisiblePolling(loadVisio, { resetKey: meetingStatus });

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
    try {
      setVisio(await setVisioParticipantSpeaking(tenantId, syndicId, meetingId, participant.participantId, allowed));
      message.success(
        allowed
          ? t('Parole donnée à {{name}}', { name: participant.name })
          : t('Parole retirée à {{name}}', { name: participant.name })
      );
    } catch (err) {
      message.error(apiErrorText(err, t('Action impossible, réessayez.')));
      refreshVisio();
    } finally {
      setBusyVisioId(null);
    }
  };

  /** Coupe (`allowed: false`) ou rétablit l'écriture d'un copropriétaire dans la discussion (spec 046, M6). */
  const writing = async (participant: MeetingVisioParticipant, allowed: boolean) => {
    if (!participant.participantId) return;
    setBusyWritingId(participant.participantId);
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
      refreshVisio();
    }
  };

  /** Exclut le participant ; en cas d'échec l'erreur remonte à la modale, qui reste ouverte. */
  const remove = async (participant: MeetingVisioParticipant, revokeLinks: boolean) => {
    if (!participant.participantId) return;
    try {
      const { revokedLinks, ...view } = await removeVisioParticipant(
        tenantId,
        syndicId,
        meetingId,
        participant.participantId,
        revokeLinks
      );
      setVisio(view);
      message.success(
        revokeLinks
          ? t('{{name}} a été exclu — {{count}} lien(s) révoqué(s)', { name: participant.name, count: revokedLinks })
          : t('{{name}} a été exclu', { name: participant.name })
      );
      if (revokeLinks) onLinksRevoked();
    } catch (err) {
      refreshVisio();
      throw new Error(apiErrorText(err, t('Exclusion impossible, réessayez.')));
    }
  };

  return {
    visio,
    visioEnabled: visio?.enabled === true,
    recordingConfigured: visio?.enabled === true && visio.recording?.enabled === true,
    activeRecording: visio?.recording?.enabled ? (visio.recording.active ?? null) : null,
    inProgress,
    refreshVisio,
    busyVisioId,
    busyWritingId,
    inVisioContactIds,
    getToken,
    speak,
    writing,
    remove
  };
}

/* ------------------------------------------------------------ enregistrements */

interface UseMeetingRecordingsOptions extends MeetingScope {
  /** L'enregistrement est configuré (carte « Visio intégrée » présente et `recording.enabled`). */
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
      const list = await getMeetingRecordings(tenantId, syndicId, meetingId);
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
    } catch {
      // Échec passager (ou droit manquant) : on garde la liste et on réessaie plus tard.
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
  const latestFailed = activeId === null && recordings[0]?.status === 'FAILED' ? recordings[0] : null;

  return {
    recordings,
    busy,
    busyRecordingId,
    processingSlow,
    latestFailed,
    start: () => toggle(true),
    stop: () => toggle(false),
    remove,
    retry
  };
}
