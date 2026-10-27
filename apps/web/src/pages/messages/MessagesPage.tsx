import React, { useCallback, useMemo, useRef, useState } from 'react';
import { App, Button, Empty, Typography } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { t } from '../../i18n/t';
import { useAuth } from '../../hooks/useAuth';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useVisiblePolling } from '../../hooks/useVisiblePolling';
import {
  getConversation,
  listConversations,
  listMessages,
  markConversationRead,
  sendMessage,
  type ConversationSummary,
  type MessagingScope,
  type ThreadMessage
} from '../../services/messaging-service';
import { ConversationList } from '../../components/messaging/ConversationList';
import { MessageComposer } from '../../components/messaging/MessageComposer';
import { MessageThread } from '../../components/messaging/MessageThread';
import { NewConversationModal } from '../../components/messaging/NewConversationModal';
import { ParticipantsPanel } from '../../components/messaging/ParticipantsPanel';
import { conversationTitle } from '../../components/messaging/messaging-utils';

const { Title, Text } = Typography;

/** Interrogation de la liste et du fil ouvert (suspendue quand l'onglet est masqué). */
export const MESSAGING_POLL_MS = 30_000;
const PAGE_SIZE = 30;

interface MessagesPageProps {
  /** Portails : scope imposé. Par défaut, l'agence active de la session. */
  scope?: MessagingScope;
  /** Préfixe des routes (`/messages` pour l'agence). */
  basePath?: string;
}

/** Fusionne deux lots de messages par identifiant, ordre chronologique. */
function mergeMessages(current: ThreadMessage[], incoming: ThreadMessage[]): ThreadMessage[] {
  const byId = new Map<string, ThreadMessage>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export default function MessagesPage({ scope: scopeProp, basePath = '/messages' }: MessagesPageProps) {
  const { message: toast } = App.useApp();
  const { user, activeTenantId } = useAuth();
  const { isMobile } = useBreakpoint();
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId?: string }>();

  const scope = useMemo<MessagingScope | null>(
    () => scopeProp ?? (activeTenantId ? { kind: 'agency', tenantId: activeTenantId } : null),
    [scopeProp, activeTenantId]
  );
  const scopeKey = scope ? (scope.kind === 'agency' ? `a:${scope.tenantId}` : `p:${scope.portal}`) : 'none';

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openedConversation, setOpenedConversation] = useState<ConversationSummary | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [creating, setCreating] = useState(false);
  const activeIdRef = useRef<string | undefined>(conversationId);
  activeIdRef.current = conversationId;

  const refreshList = useCallback(async () => {
    if (!scope) return;
    try {
      const page = await listConversations(scope, { page: 1, pageSize: 50 });
      setConversations(page.items);
    } catch {
      // Silencieux : la prochaine interrogation réessaie.
    } finally {
      setListLoading(false);
    }
  }, [scope]);

  const listPolling = useVisiblePolling(refreshList, {
    intervalMs: MESSAGING_POLL_MS,
    enabled: !!scope,
    resetKey: scopeKey
  });

  const threadTask = useCallback(async () => {
    const id = conversationId;
    if (!scope || !id) return;
    try {
      const [conversation, page] = await Promise.all([
        getConversation(scope, id),
        listMessages(scope, id, { limit: PAGE_SIZE })
      ]);
      if (activeIdRef.current !== id) return;
      setOpenedConversation(conversation);
      setMessages(current => mergeMessages(current, page.items));
      setHasMore(current => (current ? current : page.hasMore));
      // Fil visible (l'interrogation est suspendue sinon) : ce qui arrive est lu.
      if (conversation.unreadCount > 0 && document.visibilityState === 'visible') {
        await markConversationRead(scope, id);
        listPolling.refresh();
      }
    } catch {
      // Silencieux : la prochaine interrogation réessaie.
    }
  }, [scope, conversationId, listPolling]);

  const resetKey = `${scopeKey}|${conversationId ?? ''}`;
  // Changement de fil : on repart de zéro avant la première lecture.
  const lastResetKey = useRef(resetKey);
  if (lastResetKey.current !== resetKey) {
    lastResetKey.current = resetKey;
    setMessages([]);
    setHasMore(false);
    setOpenedConversation(null);
    setShowParticipants(false);
  }
  useVisiblePolling(threadTask, { intervalMs: MESSAGING_POLL_MS, enabled: !!scope && !!conversationId, resetKey });

  const loadOlder = async () => {
    if (!scope || !conversationId || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const page = await listMessages(scope, conversationId, { before: messages[0].id, limit: PAGE_SIZE });
      if (activeIdRef.current !== conversationId) return;
      setMessages(current => mergeMessages(current, page.items));
      setHasMore(page.hasMore);
    } catch {
      toast.error(t('Impossible de charger les messages'));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSend = async (body: string) => {
    if (!scope || !conversationId) return;
    try {
      const sent = await sendMessage(scope, conversationId, body);
      setMessages(current => mergeMessages(current, [sent]));
      listPolling.refresh();
    } catch (error) {
      toast.error(t("Le message n'a pas pu être envoyé"));
      throw error;
    }
  };

  const open = (id: string) => navigate(`${basePath}/${id}`);
  const closeThread = () => navigate(basePath);

  const current = openedConversation ?? conversations.find(c => c.id === conversationId) ?? null;
  const userId = user?.id ?? null;

  if (!scope) {
    return <Empty description={t('Messagerie indisponible : aucune agence active')} />;
  }

  const showList = !isMobile || !conversationId;
  const showThread = !isMobile || !!conversationId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Title level={3} style={{ margin: 0 }}>
        {t('Messagerie')}
      </Title>
      <div
        style={{
          display: 'flex',
          minHeight: 480,
          height: 'calc(100vh - 220px)',
          border: '1px solid rgba(128,128,128,0.25)',
          borderRadius: 8,
          overflow: 'hidden'
        }}
      >
        {showList ? (
          <section
            aria-label={t('Conversations')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: isMobile ? 1 : '0 0 320px',
              borderInlineEnd: isMobile ? 0 : '1px solid rgba(128,128,128,0.25)',
              minWidth: 0
            }}
          >
            <div style={{ padding: 12 }}>
              <Button type="primary" icon={<PlusOutlined />} block onClick={() => setCreating(true)}>
                {t('Nouvelle conversation')}
              </Button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <ConversationList
                conversations={conversations}
                selectedId={conversationId}
                currentUserId={userId}
                loading={listLoading}
                onSelect={open}
              />
            </div>
          </section>
        ) : null}
        {showThread ? (
          <section
            aria-label={t('Fil de discussion')}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}
          >
            {conversationId ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderBlockEnd: '1px solid rgba(128,128,128,0.25)'
                  }}
                >
                  {isMobile ? (
                    <Button type="text" icon={<ArrowLeftOutlined />} onClick={closeThread} aria-label={t('Retour')} />
                  ) : null}
                  <Text strong ellipsis style={{ flex: 1 }}>
                    {current ? conversationTitle(current, userId) : ''}
                  </Text>
                  {current ? (
                    <Button
                      type="text"
                      icon={<TeamOutlined />}
                      onClick={() => setShowParticipants(v => !v)}
                      aria-pressed={showParticipants}
                    >
                      {t('Participants')} ({current.participants.length})
                    </Button>
                  ) : null}
                </div>
                {showParticipants && current ? (
                  <div style={{ borderBlockEnd: '1px solid rgba(128,128,128,0.25)' }}>
                    <ParticipantsPanel
                      conversation={current}
                      scope={scope}
                      currentUserId={userId}
                      onChanged={updated => {
                        setOpenedConversation(updated);
                        listPolling.refresh();
                      }}
                      onLeft={() => {
                        listPolling.refresh();
                        closeThread();
                      }}
                    />
                  </div>
                ) : null}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <MessageThread
                    messages={messages}
                    participants={current?.participants ?? []}
                    hasMore={hasMore}
                    loadingMore={loadingMore}
                    onLoadMore={() => void loadOlder()}
                  />
                </div>
                <MessageComposer onSend={handleSend} />
              </>
            ) : (
              <Empty
                style={{ margin: 'auto' }}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t('Sélectionnez une conversation ou démarrez-en une nouvelle')}
              />
            )}
          </section>
        ) : null}
      </div>
      <NewConversationModal
        open={creating}
        scope={scope}
        onClose={() => setCreating(false)}
        onDone={conversation => {
          listPolling.refresh();
          open(conversation.id);
        }}
      />
    </div>
  );
}
