import React, { useState } from 'react';
import { App, Button, Popconfirm } from 'antd';
import { t } from '../../i18n/t';
import { leaveConversation, type ConversationSummary, type MessagingScope } from '../../services/messaging-service';
import { NewConversationModal } from './NewConversationModal';
import { ParticipantKindTag } from './ParticipantKindTag';

interface ParticipantsPanelProps {
  conversation: ConversationSummary;
  scope: MessagingScope;
  currentUserId?: string | null;
  onChanged: (conversation: ConversationSummary) => void;
  onLeft: () => void;
}

export function ParticipantsPanel({ conversation, scope, currentUserId, onChanged, onLeft }: ParticipantsPanelProps) {
  const { message } = App.useApp();
  const [adding, setAdding] = useState(false);
  const isGroup = conversation.kind === 'GROUP';

  const leave = async () => {
    try {
      await leaveConversation(scope, conversation.id);
      onLeft();
    } catch {
      message.error(t('Action impossible'));
    }
  };

  return (
    <div style={{ padding: 12 }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label={t('Participants')}>
        {conversation.participants.map(p => (
          <li key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span>
              {p.label}
              {p.userId === currentUserId ? ` (${t('vous')})` : ''}
            </span>
            <ParticipantKindTag kind={p.kind} />
          </li>
        ))}
      </ul>
      {isGroup ? (
        <div style={{ display: 'flex', gap: 8, marginBlockStart: 12 }}>
          <Button onClick={() => setAdding(true)}>{t('Ajouter des participants')}</Button>
          <Popconfirm
            title={t('Quitter cette conversation ?')}
            okText={t('Quitter')}
            cancelText={t('Annuler')}
            onConfirm={() => void leave()}
          >
            <Button danger>{t('Quitter la conversation')}</Button>
          </Popconfirm>
        </div>
      ) : null}
      {isGroup ? (
        <NewConversationModal
          open={adding}
          mode="add"
          scope={scope}
          conversationId={conversation.id}
          excludeUserIds={conversation.participants.map(p => p.userId)}
          onClose={() => setAdding(false)}
          onDone={onChanged}
        />
      ) : null}
    </div>
  );
}

export default ParticipantsPanel;
