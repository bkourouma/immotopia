import React, { useEffect, useRef } from 'react';
import { Alert, Button, Space } from 'antd';
import type { CopilotStatus, UseCopilotChatResult } from '../../types/copilot';
import { CopilotMessageList } from './CopilotMessageList';
import { getCopilotSuggestions, getCopilotWelcome } from './copilot-suggestions';

export interface CopilotThreadProps {
  chat: UseCopilotChatResult;
  tenantId: string;
  status: CopilotStatus;
  pathname: string;
  propertyId?: string;
  /** Envoie le texte d'une suggestion. */
  onSuggestion(text: string): void;
  /** Largeur maximale de la colonne de lecture (la page) ; sans limite dans le tiroir. */
  maxWidth?: number;
  /** Ouvre un artefact dans le panneau (page plein écran). */
  onOpenArtifact?(artifactId: string): void;
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
  propertyId,
  onSuggestion,
  maxWidth,
  onOpenArtifact
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const streaming = chat.status === 'streaming';
  const suggestions = getCopilotSuggestions(pathname, status.tools);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight });
  }, [chat.messages]);

  return (
    <div
      ref={scrollRef}
      style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-4)' }}
      role="log"
      aria-live="polite"
      aria-busy={streaming}
    >
      <div style={{ maxWidth, marginInline: maxWidth ? 'auto' : undefined }}>
        {chat.messages.length === 0 && (
          <div>
            <p>{getCopilotWelcome(status.tools)}</p>
            <Space wrap>
              {suggestions.map(s => (
                <Button key={s.id} size="small" onClick={() => onSuggestion(s.text)}>
                  {s.text}
                </Button>
              ))}
            </Space>
          </div>
        )}
        <CopilotMessageList
          messages={chat.messages}
          tenantId={tenantId}
          propertyId={propertyId}
          onConfirm={id => void chat.confirmProposal(id)}
          onCancel={chat.cancelProposal}
          onOpenArtifact={onOpenArtifact}
        />
        {chat.error && <Alert type="error" showIcon message={chat.error.message} style={{ marginTop: 12 }} />}
      </div>
    </div>
  );
};
