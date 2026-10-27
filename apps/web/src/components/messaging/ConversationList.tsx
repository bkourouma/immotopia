import React from 'react';
import { Badge, Empty, Skeleton, Typography } from 'antd';
import { t } from '../../i18n/t';
import type { ConversationSummary } from '../../services/messaging-service';
import { conversationTitle, formatMessageTime, sortByActivity } from './messaging-utils';

const { Text } = Typography;

interface ConversationListProps {
  conversations: ConversationSummary[];
  selectedId?: string | null;
  currentUserId?: string | null;
  loading?: boolean;
  onSelect: (conversationId: string) => void;
}

export function ConversationList({
  conversations,
  selectedId,
  currentUserId,
  loading,
  onSelect
}: ConversationListProps) {
  if (loading && conversations.length === 0) return <Skeleton active paragraph={{ rows: 4 }} />;
  if (conversations.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Aucune conversation pour le moment')} />;
  }
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label={t('Conversations')}>
      {sortByActivity(conversations).map(conversation => {
        const selected = conversation.id === selectedId;
        const when = conversation.lastMessage?.createdAt ?? conversation.lastMessageAt;
        return (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onSelect(conversation.id)}
              aria-current={selected ? 'true' : undefined}
              style={{
                display: 'flex',
                width: '100%',
                gap: 8,
                padding: '10px 12px',
                textAlign: 'start',
                border: 0,
                borderBottom: '1px solid rgba(128,128,128,0.2)',
                background: selected ? 'rgba(22,119,255,0.1)' : 'transparent',
                cursor: 'pointer'
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Text strong={conversation.unreadCount > 0} ellipsis style={{ flex: 1 }}>
                    {conversationTitle(conversation, currentUserId)}
                  </Text>
                  {when ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatMessageTime(when)}
                    </Text>
                  ) : null}
                </span>
                <Text type="secondary" ellipsis style={{ display: 'block', fontSize: 13 }}>
                  {conversation.lastMessage ? conversation.lastMessage.body : t('Aucun message')}
                </Text>
              </span>
              {conversation.unreadCount > 0 ? (
                <Badge count={conversation.unreadCount} aria-label={t('Messages non lus')} />
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default ConversationList;
