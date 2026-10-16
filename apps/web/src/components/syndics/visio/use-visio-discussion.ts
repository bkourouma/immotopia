import { useCallback, useEffect, useRef, useState } from 'react';
import { useDataChannel, useLocalParticipant, useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import type { DiscussionMessageView } from '../../../types/syndic-live-types';
import { t } from '../../../i18n/t';

/** Sujet des messages de données de la discussion : publiés par le serveur seulement (spec 046). */
export const DISCUSSION_TOPIC = 'ag-discussion';
const DEFAULT_MAX_LENGTH = 500;

/** Ce que la salle sait de la discussion ; chaque écran fournit le sien (copropriétaire ou gestionnaire). */
export interface VisioDiscussionAdapter {
  load: () => Promise<{ open: boolean; muted: boolean; maxLength: number; messages: DiscussionMessageView[] }>;
  /** Rejette avec une `Error` dont le message est affichable tel quel. */
  send: (body: string) => Promise<DiscussionMessageView>;
  /** Gestionnaire seulement : masquer ou rétablir un message. */
  moderation?: { setHidden: (messageId: string, hidden: boolean) => Promise<void> };
  /** Le gestionnaire écrit même quand la discussion est fermée (M5). */
  canWriteWhenClosed?: boolean;
}

export interface VisioDiscussionController {
  loaded: boolean;
  loadError: string | null;
  open: boolean;
  muted: boolean;
  canWrite: boolean;
  maxLength: number;
  messages: DiscussionMessageView[];
  unread: number;
  /** Vrai pour le gestionnaire : le texte d'un message masqué reste lisible et modifiable. */
  canModerate: boolean;
  reload: () => void;
  markRead: () => void;
  send: (body: string) => Promise<void>;
  setHidden: (messageId: string, hidden: boolean) => Promise<void>;
}

/* ------------------------------------------------------------------- lecture */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Message valide ou rien : un contenu mal formé est ignoré sans bruit. */
export function parseDiscussionMessage(value: unknown): DiscussionMessageView | null {
  if (!isRecord(value)) return null;
  const { id, authorKind, authorIdentity, authorName, body, hidden, createdAt } = value;
  if (typeof id !== 'string' || !id) return null;
  if (authorKind !== 'COOWNER' && authorKind !== 'MANAGER') return null;
  if (typeof authorIdentity !== 'string' || typeof authorName !== 'string') return null;
  if (body !== null && typeof body !== 'string') return null;
  if (typeof hidden !== 'boolean' || typeof createdAt !== 'string') return null;
  return { id, authorKind, authorIdentity, authorName, body, hidden, createdAt };
}

type DiscussionEvent =
  | { type: 'message'; message: DiscussionMessageView }
  | { type: 'restored'; message: DiscussionMessageView }
  | { type: 'hidden'; id: string }
  | { type: 'state'; open: boolean }
  | { type: 'muted'; muted: boolean };

/** Décode un message de données ; `null` pour tout contenu illisible ou de type inconnu. */
export function parseDiscussionEvent(payload: Uint8Array): DiscussionEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  switch (data.type) {
    case 'message':
    case 'restored': {
      const message = parseDiscussionMessage(data.message);
      if (!message) return null;
      return data.type === 'message' ? { type: 'message', message } : { type: 'restored', message };
    }
    case 'hidden':
      return typeof data.id === 'string' && data.id ? { type: 'hidden', id: data.id } : null;
    case 'state':
      return typeof data.open === 'boolean' ? { type: 'state', open: data.open } : null;
    case 'muted':
      return typeof data.muted === 'boolean' ? { type: 'muted', muted: data.muted } : null;
    default:
      return null;
  }
}

function time(iso: string): number {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : 0;
}

/** Ajoute ou remplace par `id`, ordre chronologique (stable à égalité). */
function upsert(list: DiscussionMessageView[], message: DiscussionMessageView): DiscussionMessageView[] {
  const index = list.findIndex(item => item.id === message.id);
  if (index >= 0) {
    const next = list.slice();
    next[index] = message;
    return next;
  }
  const next = [...list, message];
  return next.every((item, i) => i === 0 || time(next[i - 1].createdAt) <= time(item.createdAt))
    ? next
    : next
        .map((item, i) => ({ item, i }))
        .sort((a, b) => time(a.item.createdAt) - time(b.item.createdAt) || a.i - b.i)
        .map(entry => entry.item);
}

/** L'historique du serveur fait foi pour ce qu'il contient ; les messages reçus entre-temps sont gardés. */
function mergeHistory(current: DiscussionMessageView[], history: DiscussionMessageView[]): DiscussionMessageView[] {
  const known = new Set(history.map(item => item.id));
  return current.filter(item => !known.has(item.id)).reduce(upsert, history.reduce(upsert, []));
}

function errorText(err: unknown, fallback: string): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

/* --------------------------------------------------------------------- hook */

/**
 * Discussion écrite de la salle. À appeler DANS le contexte LiveKit : abonnement au sujet
 * `ag-discussion` (le serveur seul y publie), historique relu à la connexion et après une
 * reconnexion. `panelOpen` sert au décompte des messages non lus.
 */
export function useVisioDiscussion(adapter: VisioDiscussionAdapter, panelOpen: boolean): VisioDiscussionController {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const myIdentity = localParticipant?.identity;
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const identityRef = useRef(myIdentity);
  identityRef.current = myIdentity;
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  const requestRef = useRef(0);
  const mountedRef = useRef(true);

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [muted, setMuted] = useState(false);
  const [maxLength, setMaxLength] = useState(DEFAULT_MAX_LENGTH);
  const [messages, setMessages] = useState<DiscussionMessageView[]>([]);
  const [unread, setUnread] = useState(0);
  const knownIds = useRef(new Set<string>());

  const canModerate = Boolean(adapter.moderation);
  const canModerateRef = useRef(canModerate);
  canModerateRef.current = canModerate;

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const result = await adapterRef.current.load();
      if (!mountedRef.current || request !== requestRef.current) return;
      result.messages.forEach(item => knownIds.current.add(item.id));
      setOpen(result.open);
      setMuted(result.muted);
      setMaxLength(result.maxLength > 0 ? result.maxLength : DEFAULT_MAX_LENGTH);
      setMessages(current => mergeHistory(current, result.messages));
      setLoadError(null);
      setLoaded(true);
    } catch (err) {
      if (!mountedRef.current || request !== requestRef.current) return;
      setLoadError(errorText(err, t('Impossible de charger la discussion, réessayez.')));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  // Après une coupure de la connexion, des messages ont pu passer : l'historique est relu.
  useEffect(() => {
    const onReconnected = () => void load();
    room.on(RoomEvent.Reconnected, onReconnected);
    return () => {
      room.off(RoomEvent.Reconnected, onReconnected);
    };
  }, [room, load]);

  const receive = useCallback((message: DiscussionMessageView, countUnread: boolean) => {
    const isNew = !knownIds.current.has(message.id);
    knownIds.current.add(message.id);
    setMessages(current => upsert(current, message));
    if (isNew && countUnread && !panelOpenRef.current && message.authorIdentity !== identityRef.current) {
      setUnread(count => count + 1);
    }
  }, []);

  useDataChannel(DISCUSSION_TOPIC, incoming => {
    // Seul le serveur publie sur ce sujet : un message qui porte un émetteur est une imitation.
    if (incoming.from) return;
    const event = parseDiscussionEvent(incoming.payload);
    if (!event) return;
    if (event.type === 'message') {
      receive(event.message, true);
    } else if (event.type === 'restored') {
      receive(event.message, false);
    } else if (event.type === 'hidden') {
      setMessages(current =>
        current.map(item =>
          item.id === event.id ? { ...item, hidden: true, body: canModerateRef.current ? item.body : null } : item
        )
      );
    } else if (event.type === 'state') {
      setOpen(event.open);
    } else {
      setMuted(event.muted);
    }
  });

  const markRead = useCallback(() => setUnread(0), []);
  useEffect(() => {
    if (panelOpen) setUnread(0);
  }, [panelOpen]);

  const send = useCallback(
    async (body: string) => {
      const sent = await adapterRef.current.send(body);
      receive(sent, false);
    },
    [receive]
  );

  const setHidden = useCallback(async (messageId: string, hidden: boolean) => {
    const moderation = adapterRef.current.moderation;
    if (!moderation) return;
    await moderation.setHidden(messageId, hidden);
    setMessages(current => current.map(item => (item.id === messageId ? { ...item, hidden } : item)));
  }, []);

  const canWrite = loaded && !muted && (open || Boolean(adapter.canWriteWhenClosed));

  return {
    loaded,
    loadError,
    open,
    muted,
    canWrite,
    maxLength,
    messages,
    unread,
    canModerate,
    reload: () => void load(),
    markRead,
    send,
    setHidden
  };
}
