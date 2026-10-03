import React from 'react';
import type { CopilotAttachment, CopilotUiMessage } from '../../types/copilot';
import { ActionProposalCard } from './ActionProposalCard';
import { ArtifactChip } from './artifact/ArtifactChip';
import { DocumentListCard } from './DocumentListCard';
import { LeaseResultCard } from './LeaseResultCard';
import { PropertyResultCard } from './PropertyResultCard';
import { SafeMarkdown } from './SafeMarkdown';

export interface CopilotMessageListProps {
  messages: CopilotUiMessage[];
  tenantId: string;
  onConfirm(proposalId: string): void;
  onCancel(proposalId: string): void;
  /** Bien affiché à l'écran : nécessaire au téléchargement des pièces d'un bien. */
  propertyId?: string;
  /** Ouvre un artefact dans le panneau ; sans lui (tiroir), la pastille n'est pas cliquable. */
  onOpenArtifact?(artifactId: string): void;
}

function Attachment({
  attachment,
  tenantId,
  propertyId,
  onConfirm,
  onCancel,
  onOpenArtifact
}: { attachment: CopilotAttachment } & Omit<CopilotMessageListProps, 'messages'>): React.ReactElement {
  switch (attachment.kind) {
    case 'properties':
      return (
        <>
          {attachment.items.map(item => (
            <PropertyResultCard key={item.id} item={item} tenantId={tenantId} />
          ))}
        </>
      );
    case 'leases':
      return (
        <>
          {attachment.items.map(item => (
            <LeaseResultCard key={item.id} item={item} tenantId={tenantId} />
          ))}
        </>
      );
    case 'documents':
      return (
        <DocumentListCard
          scope={attachment.scope}
          items={attachment.items}
          tenantId={tenantId}
          propertyId={propertyId}
        />
      );
    case 'artifact':
      return (
        <ArtifactChip
          title={attachment.title}
          kind={attachment.artifactKind}
          onOpen={onOpenArtifact ? () => onOpenArtifact(attachment.artifactId) : undefined}
        />
      );
    case 'proposal':
      return (
        <ActionProposalCard
          proposal={attachment.proposal}
          state={attachment.state}
          result={attachment.result}
          error={attachment.error}
          tenantId={tenantId}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );
  }
}

export function CopilotMessageList({
  messages,
  tenantId,
  onConfirm,
  onCancel,
  propertyId,
  onOpenArtifact
}: CopilotMessageListProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {messages.map(message => {
        const isUser = message.role === 'user';
        return (
          <div
            key={message.id}
            data-role={message.role}
            style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '92%' }}
          >
            {message.text ? (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: isUser
                    ? 'var(--ant-color-primary-bg, #e6f4ff)'
                    : 'var(--ant-color-fill-tertiary, #f5f5f5)',
                  overflowWrap: 'anywhere'
                }}
              >
                {isUser ? (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{message.text}</span>
                ) : (
                  <SafeMarkdown text={message.text} />
                )}
              </div>
            ) : null}
            {message.attachments.map((attachment, index) => (
              <div
                key={`${message.id}-a${index}`}
                style={{ marginBlockStart: 8, display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <Attachment
                  attachment={attachment}
                  tenantId={tenantId}
                  propertyId={propertyId}
                  onConfirm={onConfirm}
                  onCancel={onCancel}
                  onOpenArtifact={onOpenArtifact}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default CopilotMessageList;
