import React from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import { CameraOutlined, WarningOutlined } from '@ant-design/icons';
import type { ConversationInteractiveItem, ConversationMessage } from '../../../../types/finance-stock-whatsapp-types';
import { t } from '../../../../i18n/t';
import { formatDateTime } from './whatsapp-labels';

export interface ConversationThreadProps {
  messages: ConversationMessage[];
  /** Message lié à cette capture : surligné (visualiseur de preuve). */
  highlightCaptureId?: string | null;
  /**
   * Présent dans le simulateur seulement : les boutons et les lignes de liste
   * d'un message du bot deviennent cliquables et envoient la réponse.
   */
  onReply?: (item: { id: string; title: string }) => void;
  /** Envoi en cours : les réponses cliquables sont grisées. */
  replyDisabled?: boolean;
}

/**
 * Fil d'une conversation WhatsApp (ecrans §4.4 et §5.3).
 *
 * Bulles entrantes (le chef) au début de la ligne, sortantes (le bot) à la
 * fin : `margin-inline-start: auto`, que l'arabe inverse de lui-même.
 *
 * Le texte d'un message est du CONTENU UTILISATEUR : il est rendu en texte
 * brut, jamais interprété comme du HTML. Une photo n'est pas chargée ici : le
 * fil dit seulement qu'une photo a été reçue (sa lecture est tracée, elle se
 * fait dans le visualiseur de preuve).
 */
export const ConversationThread: React.FC<ConversationThreadProps> = ({
  messages,
  highlightCaptureId,
  onReply,
  replyDisabled = false
}) => {
  if (messages.length === 0) {
    return <Typography.Text type="secondary">{t('Aucun message.')}</Typography.Text>;
  }

  return (
    <ol
      aria-label={t('Conversation WhatsApp')}
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {messages.map(message => (
        <MessageBubble
          key={message.id}
          message={message}
          highlighted={Boolean(highlightCaptureId) && message.captureId === highlightCaptureId}
          onReply={onReply}
          replyDisabled={replyDisabled}
        />
      ))}
    </ol>
  );
};

interface MessageBubbleProps {
  message: ConversationMessage;
  highlighted: boolean;
  onReply?: (item: { id: string; title: string }) => void;
  replyDisabled: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, highlighted, onReply, replyDisabled }) => {
  const sortant = message.direction === 'OUTBOUND';
  const items = (message.interactive ?? []).filter((item): item is ConversationInteractiveItem & { id: string } =>
    Boolean(item && item.id)
  );
  const propose = sortant && (message.kind === 'BUTTONS' || message.kind === 'LIST') && items.length > 0;

  return (
    <li
      data-direction={message.direction}
      data-highlighted={highlighted ? 'true' : undefined}
      style={{
        maxWidth: '85%',
        marginInlineStart: sortant ? 'auto' : 0,
        marginInlineEnd: sortant ? 0 : 'auto',
        padding: '8px 12px',
        borderRadius: 12,
        background: sortant ? 'var(--color-primary-bg, #e6f4ff)' : 'var(--surface-sunken, #f5f5f5)',
        border: highlighted ? '2px solid var(--color-warning, #faad14)' : '1px solid var(--border-subtle, #f0f0f0)'
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
        {sortant ? t('Bot') : t('Chef de chantier')} · {formatDateTime(message.createdAt)}
      </Typography.Text>

      <MessageBody message={message} />

      {propose && (
        <Space size={[4, 4]} wrap style={{ marginBlockStart: 6 }}>
          {items.map(item =>
            onReply ? (
              <Button
                key={item.id}
                size="small"
                shape="round"
                disabled={replyDisabled}
                onClick={() => onReply({ id: item.id, title: item.title ?? item.id })}
              >
                {item.title ?? item.id}
              </Button>
            ) : (
              <Tag key={item.id} style={{ borderRadius: 12 }}>
                {item.title ?? item.id}
              </Tag>
            )
          )}
        </Space>
      )}

      {message.sendError && (
        <Typography.Text type="warning" style={{ display: 'block', fontSize: 12, marginBlockStart: 4 }}>
          <WarningOutlined /> {t('Envoi non abouti : {{error}}', { error: message.sendError })}
        </Typography.Text>
      )}
    </li>
  );
};

const MessageBody: React.FC<{ message: ConversationMessage }> = ({ message }) => {
  const texte = message.text ?? '';
  const brut = <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{texte}</span>;

  switch (message.kind) {
    case 'IMAGE':
      return (
        <span>
          <CameraOutlined /> {t('Photo')}
          {texte && <span style={{ display: 'block' }}>{brut}</span>}
        </span>
      );
    case 'REPLY': {
      const choix = message.interactive?.[0]?.title ?? texte;
      return <span>{t('Réponse : {{choice}}', { choice: choix })}</span>;
    }
    case 'UNSUPPORTED':
      return <Typography.Text type="secondary">{t('Message non pris en charge')}</Typography.Text>;
    default:
      return brut;
  }
};

export default ConversationThread;
