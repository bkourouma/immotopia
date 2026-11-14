import React, { useEffect } from 'react';
import { Button, Card, Space, message as antMessage } from 'antd';
import { Link } from 'react-router-dom';
import { CopyOutlined, SoundOutlined, StopOutlined } from '@ant-design/icons';
import { useCopilotSpeech } from '../../hooks/useCopilotSpeech';
import i18next from '../../i18n';
import { t } from '../../i18n/t';
import { ResponseFeedbackButton } from './ResponseFeedbackButton';
import { copilotService } from '../../services/copilot-service';
import { filenameFromDisposition, saveBlob } from '../../utils/save-blob';
import type { CopilotAttachment, CopilotUiMessage } from '../../types/copilot';
import { ActionProposalCard } from './ActionProposalCard';
import { ArtifactChip } from './artifact/ArtifactChip';
import { DocumentListCard } from './DocumentListCard';
import { LeaseResultCard } from './LeaseResultCard';
import { PropertyResultCard } from './PropertyResultCard';
import { SafeMarkdown } from './SafeMarkdown';
import { WritePlanCard } from './WritePlanCard';
import { FollowUpCard } from './FollowUpCard';
import { rentalAlertDescription, rentalAlertLabels, rentalAlertParams } from './rental-alert-labels';

export interface CopilotMessageListProps {
  messages: CopilotUiMessage[];
  streaming?: boolean;
  conversationId?: string;
  visible?: boolean;
  tenantId: string;
  onConfirm(proposalId: string): void;
  onCancel(proposalId: string): void;
  /** Accord d'un plan d'écriture (étape 4) ; `confirmation` : mot saisi pour un plan sensible. */
  onApprovePlan?(proposalId: string, confirmation?: string): void;
  onRefusePlan?(proposalId: string): void;
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
  onApprovePlan,
  onRefusePlan,
  onOpenArtifact,
  streaming,
  conversationId
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
    case 'write_plan':
      return (
        <WritePlanCard
          plan={attachment.plan}
          state={attachment.state}
          result={attachment.result}
          error={attachment.error}
          decidedAt={attachment.decidedAt}
          onApprove={(id, confirmation) => onApprovePlan?.(id, confirmation)}
          onRefuse={id => onRefusePlan?.(id)}
        />
      );
    case 'follow_up':
      return (
        <FollowUpCard
          key={attachment.proposal.id}
          tenantId={tenantId}
          proposal={attachment.proposal}
          streaming={streaming}
        />
      );
    case 'prepared_alert': {
      if (attachment.alert.kind === 'rental') {
        const { rule, propertyLabel } = attachment.alert;
        return (
          <Card title={rentalAlertLabels()[rule.kind]} size="small">
            <p>{rentalAlertDescription(rule)}</p>
            {propertyLabel && <p>{propertyLabel}</p>}
            <Link to={`/tenant/${encodeURIComponent(tenantId)}/assistant?${rentalAlertParams(rule, conversationId)}`}>
              {t('Ouvrir le formulaire d’alerte')}
            </Link>
          </Card>
        );
      }
      const { siteId, siteName, thresholdPercent } = attachment.alert;
      const path = `/tenant/${encodeURIComponent(tenantId)}/finance/chantiers/${encodeURIComponent(siteId)}/budget`;
      return (
        <Card title={t('Alerte budgétaire préparée')} size="small">
          <p>
            {t('{{site}} · Seuil de {{threshold}} % du budget révisé', { site: siteName, threshold: thresholdPercent })}
          </p>
          <Link to={`${path}?alerte-budget=${thresholdPercent}`}>{t('Ouvrir le formulaire d’alerte')}</Link>
        </Card>
      );
    }
  }
}

export function CopilotMessageList({
  messages,
  streaming,
  conversationId,
  visible = true,
  tenantId,
  onConfirm,
  onCancel,
  onApprovePlan,
  onRefusePlan,
  propertyId,
  onOpenArtifact
}: CopilotMessageListProps): React.ReactElement {
  const [notifications, notificationContext] = antMessage.useMessage();
  const { supported, activeId, read, stop } = useCopilotSpeech(i18next.language || 'fr', tenantId);

  useEffect(() => {
    if (activeId && (!visible || !messages.some(message => message.id === activeId))) stop();
  }, [activeId, messages, stop, visible]);

  async function downloadFile(threadId: string, turnId: string, position: number, name: string) {
    try {
      const { data, headers } = await copilotService.downloadAttachment(tenantId, threadId, turnId, position);
      saveBlob(data, filenameFromDisposition(headers['content-disposition'], name));
    } catch {
      void notifications.error(t('Impossible de télécharger la pièce jointe.'));
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      void notifications.success(t('Réponse copiée'));
    } catch {
      void notifications.error(t('Impossible de copier la réponse'));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {notificationContext}
      {messages.map((message, index) => {
        const isUser = message.role === 'user';
        return (
          <div
            key={message.id}
            data-role={message.role}
            style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '92%' }}
          >
            {message.text ? (
              <div
                data-copilot-answer
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
            {!!message.files?.length && (
              <ul style={{ marginBlock: 4, paddingInlineStart: 20 }}>
                {message.files.map(({ name, position }, index) => (
                  <li key={index} dir="auto">
                    {conversationId && position !== undefined ? (
                      <Button
                        type="link"
                        size="small"
                        onClick={() => void downloadFile(conversationId, message.id, position, name)}
                      >
                        {name}
                      </Button>
                    ) : (
                      name
                    )}
                  </li>
                ))}
              </ul>
            )}
            {message.attachments.map((attachment, index) => (
              <div
                key={`${message.id}-a${index}`}
                style={{ marginBlockStart: 8, display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <Attachment
                  attachment={attachment}
                  streaming={streaming}
                  conversationId={conversationId}
                  tenantId={tenantId}
                  propertyId={propertyId}
                  onConfirm={onConfirm}
                  onCancel={onCancel}
                  onApprovePlan={onApprovePlan}
                  onRefusePlan={onRefusePlan}
                  onOpenArtifact={onOpenArtifact}
                />
              </div>
            ))}
            {!isUser && message.text.trim() && !(streaming && index === messages.length - 1) && (
              <Space wrap style={{ marginBlockStart: 4 }}>
                {conversationId && message.rating && (
                  <ResponseFeedbackButton
                    key={message.rating.revision}
                    tenantId={tenantId}
                    conversationId={conversationId}
                    rating={message.rating}
                  />
                )}
                {typeof navigator.clipboard?.writeText === 'function' && (
                  <Button
                    size="small"
                    type="text"
                    icon={<CopyOutlined aria-hidden="true" />}
                    onClick={() => void copy(message.text)}
                  >
                    {t('Copier la réponse')}
                  </Button>
                )}
                {supported && (
                  <Button
                    size="small"
                    type="text"
                    icon={
                      activeId === message.id ? (
                        <StopOutlined aria-hidden="true" />
                      ) : (
                        <SoundOutlined aria-hidden="true" />
                      )
                    }
                    onClick={event => {
                      if (activeId === message.id) {
                        stop();
                        return;
                      }
                      const answer = event.currentTarget
                        .closest('[data-role]')
                        ?.querySelector<HTMLElement>('[data-copilot-answer]');
                      read(message.id, answer?.innerText || message.text, () => {
                        void notifications.error(t('La lecture à voix haute a échoué'));
                      });
                    }}
                  >
                    {activeId === message.id ? t('Arrêter la lecture') : t('Lire à voix haute')}
                  </Button>
                )}
              </Space>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default CopilotMessageList;
