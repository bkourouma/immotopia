import React, { useEffect, useRef } from 'react';
import { Alert, Button, Space } from 'antd';
import { useAssistantTranslation } from '../../i18n/useAssistantTranslation';
import type { CopilotStatus, UseCopilotChatResult } from '../../types/copilot';
import { CopilotMessageList } from './CopilotMessageList';
import { getCopilotSuggestions, getCopilotWelcome } from './copilot-suggestions';

export interface CopilotThreadProps {
  chat: UseCopilotChatResult;
  tenantId: string;
  status: CopilotStatus;
  pathname: string;
  visible?: boolean;
  propertyId?: string;
  /** Envoie le texte d'une suggestion. */
  onSuggestion(text: string): void;
  /** Largeur maximale de la colonne de lecture (la page) ; sans limite dans le tiroir. */
  maxWidth?: number;
  /** Ouvre un artefact dans le panneau (page plein écran). */
  onOpenArtifact?(artifactId: string, version?: number): void;
}

/**
 * Fil d'une conversation ImmoCopilot : accueil et suggestions, messages et
 * cartes, erreur. Seul élément qui défile ; reste calé sur le dernier message.
 */
export const CopilotThread: React.FC<CopilotThreadProps> = ({
  chat,
  tenantId,
  status,
  pathname,
  visible,
  propertyId,
  onSuggestion,
  maxWidth,
  onOpenArtifact
}) => {
  const { language, t } = useAssistantTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const streaming = chat.status === 'streaming';
  const suggestions = getCopilotSuggestions(pathname, status.tools, t);
  const last = chat.messages[chat.messages.length - 1];
  // Tant que l'assistant n'a rien écrit, on le dit : sinon l'écran semble figé.
  const thinking = streaming && !(last?.role === 'assistant' && last.text.trim());

  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight });
  }, [chat.messages]);

  return (
    <div
      ref={scrollRef}
      style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-4)' }}
      role="log"
      lang={language}
      aria-live="polite"
      aria-busy={streaming}
    >
      <div style={{ maxWidth, marginInline: maxWidth ? 'auto' : undefined }}>
        {chat.messages.length === 0 && (
          <div>
            <p>{getCopilotWelcome(status.tools, t)}</p>
            {suggestions.length > 0 && (
              <p style={{ color: 'var(--text-secondary, #8c8c8c)', marginBlockEnd: 8 }}>
                {t('Touchez une question pour commencer, ou écrivez la vôtre.')}
              </p>
            )}
            <Space wrap>
              {suggestions.map(s => (
                <Button
                  key={s.id}
                  onClick={() => onSuggestion(s.text)}
                  style={{ minHeight: 44, height: 'auto', whiteSpace: 'normal', textAlign: 'start' }}
                >
                  {s.text}
                </Button>
              ))}
            </Space>
          </div>
        )}
        <CopilotMessageList
          messages={chat.messages}
          artifacts={chat.artifacts}
          streaming={streaming}
          conversationId={chat.conversationId}
          visible={visible}
          tenantId={tenantId}
          propertyId={propertyId}
          onConfirm={id => void chat.confirmProposal(id)}
          onCancel={chat.cancelProposal}
          onApprovePlan={(id, confirmation) => void chat.approveWritePlan(id, confirmation)}
          onRefusePlan={chat.refuseWritePlan}
          onOpenArtifact={onOpenArtifact}
        />
        {thinking && (
          <p role="status" style={{ color: 'var(--text-secondary, #8c8c8c)', marginBlockStart: 12 }}>
            {t('ImmoCopilot réfléchit…')}
          </p>
        )}
        {chat.error && <Alert type="error" showIcon message={chat.error.message} style={{ marginBlockStart: 12 }} />}
      </div>
    </div>
  );
};
