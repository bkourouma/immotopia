import { useCallback, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import {
  getMeetingDiscussion,
  postMeetingDiscussionMessage,
  setMeetingDiscussionMessageHidden,
  setMeetingDiscussionOpen
} from '../../../services/syndic-service';
import type { ManagerDiscussionMessageView, ManagerDiscussionView } from '../../../types/syndic-live-types';
import type { MeetingStatus } from '../../../types/syndic-types';
import { useVisiblePolling } from '../../../hooks/useVisiblePolling';
import { t } from '../../../i18n/t';
import { apiErrorText } from './use-meeting-visio';
import type { VisioDiscussionAdapter } from './use-visio-discussion';

/** Délai entre deux lectures de la discussion pendant la séance (spec 046). */
export const DISCUSSION_POLL_INTERVAL_MS = 5000;

interface UseMeetingDiscussionOptions {
  tenantId: string;
  syndicId: string;
  meetingId: string;
  meetingStatus: MeetingStatus;
}

function withMessage(
  view: ManagerDiscussionView | null,
  message: ManagerDiscussionMessageView
): ManagerDiscussionView | null {
  if (!view) return view;
  const exists = view.messages.some(item => item.id === message.id);
  return {
    ...view,
    messages: exists
      ? view.messages.map(item => (item.id === message.id ? message : item))
      : [...view.messages, message]
  };
}

/**
 * Discussion de la visio côté gestionnaire (spec 046) : lecture de `/visio/discussion`
 * toutes les 5 s pendant la séance (une fois sinon), ouverture, masquage, envoi, et
 * l'adaptateur que la salle du modérateur utilise.
 */
export function useMeetingDiscussion({ tenantId, syndicId, meetingId, meetingStatus }: UseMeetingDiscussionOptions) {
  const { message } = App.useApp();
  const [discussion, setDiscussion] = useState<ManagerDiscussionView | null>(null);
  const [busyOpen, setBusyOpen] = useState(false);
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
  const inProgress = meetingStatus === 'IN_PROGRESS';

  const loadDiscussion = useCallback(async (): Promise<number | false | void> => {
    try {
      setDiscussion(await getMeetingDiscussion(tenantId, syndicId, meetingId));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      // Droit manquant ou API plus ancienne : rien à surveiller.
      if (status === 403 || status === 404) return false;
      // Échec passager : on garde la dernière lecture et on réessaie.
    }
    return inProgress ? DISCUSSION_POLL_INTERVAL_MS : false;
  }, [tenantId, syndicId, meetingId, inProgress]);

  const { refresh } = useVisiblePolling(loadDiscussion, {
    intervalMs: DISCUSSION_POLL_INTERVAL_MS,
    resetKey: meetingStatus
  });
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const toggleOpen = async (open: boolean) => {
    setBusyOpen(true);
    try {
      await setMeetingDiscussionOpen(tenantId, syndicId, meetingId, open);
      setDiscussion(view => (view ? { ...view, open } : view));
      message.success(open ? t('Discussion rouverte aux copropriétaires') : t('Discussion fermée aux copropriétaires'));
    } catch (err) {
      message.error(apiErrorText(err, t('Action impossible, réessayez.')));
      refresh();
    } finally {
      setBusyOpen(false);
    }
  };

  const setHidden = async (messageId: string, hidden: boolean) => {
    setBusyMessageId(messageId);
    try {
      const updated = await setMeetingDiscussionMessageHidden(tenantId, syndicId, meetingId, messageId, hidden);
      setDiscussion(view => withMessage(view, updated));
      message.success(hidden ? t('Message masqué') : t('Message rétabli'));
    } catch (err) {
      message.error(apiErrorText(err, t('Action impossible, réessayez.')));
      refresh();
    } finally {
      setBusyMessageId(null);
    }
  };

  /** Envoi du gestionnaire depuis la carte ; l'erreur remonte au champ de saisie, qui garde le texte. */
  const send = async (body: string) => {
    try {
      const sent = await postMeetingDiscussionMessage(tenantId, syndicId, meetingId, body);
      setDiscussion(view => withMessage(view, sent));
    } catch (err) {
      throw new Error(apiErrorText(err, t('Message non envoyé, réessayez.')));
    }
  };

  /** Adaptateur de la salle du modérateur : lit et écrit par les mêmes routes que la carte. */
  const roomAdapter = useMemo<VisioDiscussionAdapter>(
    () => ({
      canWriteWhenClosed: true,
      load: async () => {
        try {
          const view = await getMeetingDiscussion(tenantId, syndicId, meetingId);
          return { open: view.open, muted: false, maxLength: view.maxLength, messages: view.messages };
        } catch (err) {
          throw new Error(apiErrorText(err, t('Impossible de charger la discussion, réessayez.')));
        }
      },
      send: async body => {
        try {
          const sent = await postMeetingDiscussionMessage(tenantId, syndicId, meetingId, body);
          refreshRef.current();
          return sent;
        } catch (err) {
          throw new Error(apiErrorText(err, t('Message non envoyé, réessayez.')));
        }
      },
      moderation: {
        setHidden: async (messageId, hidden) => {
          try {
            await setMeetingDiscussionMessageHidden(tenantId, syndicId, meetingId, messageId, hidden);
            refreshRef.current();
          } catch (err) {
            throw new Error(apiErrorText(err, t('Action impossible, réessayez.')));
          }
        }
      }
    }),
    [tenantId, syndicId, meetingId]
  );

  return {
    discussion,
    discussionEnabled: discussion?.enabled === true,
    inProgress,
    busyOpen,
    busyMessageId,
    refreshDiscussion: refresh,
    toggleOpen,
    setHidden,
    send,
    roomAdapter
  };
}
