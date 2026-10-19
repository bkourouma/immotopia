import React, { useEffect, useRef } from 'react';
import { Button, Empty, Typography } from 'antd';
import { t } from '../../i18n/t';
import type { MessagingParticipant, ThreadMessage } from '../../services/messaging-service';
import { ParticipantKindTag } from './ParticipantKindTag';
import { formatMessageTime } from './messaging-utils';

const { Text } = Typography;

interface MessageThreadProps {
  messages: ThreadMessage[];
  participants: MessagingParticipant[];
  hasMore: boolean;
  loadingMore?: boolean;
  onLoadMore: () => void;
}

export function MessageThread({ messages, participants, hasMore, loadingMore, onLoadMore }: MessageThreadProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;

  // Le fil se cale sur le dernier message quand il en arrive un nouveau (pas quand on charge de l'ancien).
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [lastId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }} aria-label={t('Messages')}>
      {hasMore ? (
        <Button size="small" onClick={onLoadMore} loading={loadingMore} style={{ alignSelf: 'center' }}>
          {t('Charger les messages plus anciens')}
        </Button>
      ) : null}
      {messages.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Aucun message')} />
      ) : (
        messages.map(message => {
          const kind = participants.find(p => p.userId === message.authorUserId)?.kind;
          return (
            <div
              key={message.id}
              // Flex en colonne : `flex-end` suit le sens d'écriture (fin de ligne, donc inversé en RTL).
              style={{
                alignSelf: message.mine ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                padding: '8px 12px',
                borderRadius: 12,
                background: message.mine ? 'rgba(22,119,255,0.15)' : 'rgba(128,128,128,0.15)'
              }}
            >
              {!message.mine ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBlockEnd: 2 }}>
                  <Text strong style={{ fontSize: 12 }}>
                    {message.authorLabel}
                  </Text>
                  {kind ? <ParticipantKindTag kind={kind} /> : null}
                </div>
              ) : null}
              {/* Contenu non fiable : texte brut, retours à la ligne conservés. */}
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.body}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {formatMessageTime(message.createdAt)}
              </Text>
            </div>
          );
        })
      )}
      <div ref={endRef} />
    </div>
  );
}

export default MessageThread;
