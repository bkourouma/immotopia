import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Tag, Typography } from 'antd';
import type { DiscussionMessageView } from '../../../types/syndic-live-types';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import type { VisioDiscussionController } from './use-visio-discussion';

const { Text } = Typography;

const MUTED_COLOR = '#9aa0a6';
const NEAR_BOTTOM_PX = 48;

/** Heure locale HH:mm (jamais la date : la salle est celle d'une seule séance). */
function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(activeLocale(), { hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------------ message */

interface MessageItemProps {
  message: DiscussionMessageView;
  canModerate: boolean;
  busy: boolean;
  onToggleHidden: (message: DiscussionMessageView) => void;
}

/**
 * Un message. Le texte est rendu comme TEXTE React : aucun HTML, aucun lien cliquable,
 * aucune détection d'adresse (spec 046, M3).
 */
const MessageItem: React.FC<MessageItemProps> = ({ message, canModerate, busy, onToggleHidden }) => {
  // Le gestionnaire garde le texte d'un message masqué ; le copropriétaire n'en reçoit plus rien.
  const hiddenForMe = message.hidden && message.body === null;
  const dimmed = message.hidden && !hiddenForMe;
  return (
    <li style={{ listStyle: 'none', marginBlockEnd: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <Text strong style={{ color: 'inherit', overflowWrap: 'anywhere' }}>
          {message.authorName}
        </Text>
        {message.authorKind === 'MANAGER' ? <Tag style={{ margin: 0 }}>{t('Gestionnaire')}</Tag> : null}
        <time dateTime={message.createdAt} style={{ color: MUTED_COLOR, fontSize: 12 }}>
          {formatClock(message.createdAt)}
        </time>
        {dimmed ? (
          <Tag color="orange" style={{ margin: 0 }}>
            {t('masqué')}
          </Tag>
        ) : null}
        {canModerate ? (
          <Button
            size="small"
            type="link"
            disabled={busy}
            aria-label={
              message.hidden
                ? t('Rétablir le message de {{name}}', { name: message.authorName })
                : t('Masquer le message de {{name}}', { name: message.authorName })
            }
            onClick={() => onToggleHidden(message)}
          >
            {message.hidden ? t('Rétablir') : t('Masquer')}
          </Button>
        ) : null}
      </div>
      {hiddenForMe ? (
        <div style={{ fontStyle: 'italic', color: MUTED_COLOR }}>{t('Message masqué par le gestionnaire')}</div>
      ) : (
        <div
          style={{
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            color: dimmed ? MUTED_COLOR : undefined
          }}
        >
          {message.body}
        </div>
      )}
    </li>
  );
};

/* -------------------------------------------------------------------- saisie */

export interface DiscussionComposerProps {
  canWrite: boolean;
  maxLength: number;
  /** Rejette avec une `Error` dont le message est affichable ; le texte saisi est alors conservé. */
  send: (body: string) => Promise<void>;
  /** Trait de séparation au-dessus (panneau sombre de la salle). */
  bordered?: boolean;
}

/** Zone de saisie : Entrée envoie, Maj+Entrée revient à la ligne, texte gardé si l'envoi échoue. */
export const DiscussionComposer: React.FC<DiscussionComposerProps> = ({
  canWrite,
  maxLength,
  send,
  bordered = true
}) => {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);

  const empty = draft.trim() === '';

  const submit = async () => {
    if (sendingRef.current || !canWrite || empty) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      await send(draft);
      setDraft('');
    } catch (err) {
      // Le texte est conservé pour une nouvelle tentative.
      const message = (err as { message?: unknown } | null)?.message;
      setError(typeof message === 'string' && message.trim() ? message : t('Message non envoyé, réessayez.'));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div style={{ padding: '8px 12px', borderBlockStart: bordered ? '1px solid #262a33' : undefined }}>
      <Input.TextArea
        value={draft}
        aria-label={t('Votre message')}
        placeholder={t('Écrire un message…')}
        maxLength={maxLength}
        autoSize={{ minRows: 1, maxRows: 4 }}
        disabled={!canWrite}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          void submit();
        }}
      />
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBlockStart: 6 }}
      >
        <Text style={{ color: MUTED_COLOR, fontSize: 12 }} aria-hidden="true">
          {draft.length}/{maxLength}
        </Text>
        <Button
          type="primary"
          size="small"
          loading={sending}
          disabled={!canWrite || empty}
          onClick={() => void submit()}
        >
          {t('Envoyer')}
        </Button>
      </div>
      {error ? (
        <div role="alert" style={{ marginBlockStart: 4 }}>
          <Text type="danger">{error}</Text>
        </div>
      ) : null}
    </div>
  );
};

/* --------------------------------------------------------------------- panneau */

export interface VisioDiscussionPanelProps {
  controller: VisioDiscussionController;
  /** Salle étroite : le panneau remplace la grille et propose de revenir à la vidéo. */
  onBack?: () => void;
}

export const VisioDiscussionPanel: React.FC<VisioDiscussionPanelProps> = ({ controller, onBack }) => {
  const { messages, canModerate, setHidden, loaded, loadError, open, muted, reload } = controller;
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [moderationError, setModerationError] = useState<string | null>(null);

  // Suit le bas de la liste, sauf si l'utilisateur est remonté lire plus haut.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && stickRef.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, []);

  const toggleHidden = async (message: DiscussionMessageView) => {
    setBusyId(message.id);
    setModerationError(null);
    try {
      await setHidden(message.id, !message.hidden);
    } catch (err) {
      const text = (err as { message?: unknown } | null)?.message;
      setModerationError(typeof text === 'string' && text.trim() ? text : t('Action impossible, réessayez.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      aria-label={t('Discussion')}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, minWidth: 0 }}
    >
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
        <Text strong style={{ color: 'inherit' }}>
          {t('Discussion')}
        </Text>
        {onBack ? (
          <Button size="small" onClick={onBack}>
            {t('Retour à la vidéo')}
          </Button>
        ) : null}
      </div>
      <div style={{ padding: '8px 12px', fontSize: 12, color: MUTED_COLOR }}>
        {t(
          'Vos messages sont visibles de tous les participants de la visio et conservés par le syndic. Un message ne vaut pas vote.'
        )}
      </div>
      {!open ? <Alert type="info" banner message={t('Le gestionnaire a fermé la discussion.')} /> : null}
      {muted ? <Alert type="warning" banner message={t("Le gestionnaire a suspendu votre droit d'écrire.")} /> : null}
      {loadError ? (
        <Alert
          type="error"
          banner
          message={loadError}
          action={
            <Button size="small" onClick={reload}>
              {t('Réessayer')}
            </Button>
          }
        />
      ) : null}
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label={t('Messages de la discussion')}
        tabIndex={0}
        onScroll={event => {
          const list = event.currentTarget;
          stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= NEAR_BOTTOM_PX;
        }}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 12px' }}
      >
        {loaded && messages.length === 0 ? (
          <Text style={{ color: MUTED_COLOR }}>{t("Aucun message pour l'instant.")}</Text>
        ) : null}
        <ul style={{ margin: 0, padding: 0 }}>
          {messages.map(message => (
            <MessageItem
              key={message.id}
              message={message}
              canModerate={canModerate}
              busy={busyId === message.id}
              onToggleHidden={item => void toggleHidden(item)}
            />
          ))}
        </ul>
      </div>
      {moderationError ? (
        <div role="alert" style={{ padding: '0 12px' }}>
          <Text type="danger">{moderationError}</Text>
        </div>
      ) : null}
      <DiscussionComposer canWrite={controller.canWrite} maxLength={controller.maxLength} send={controller.send} />
    </section>
  );
};

export default VisioDiscussionPanel;
