import React, { useEffect, useRef, useState } from 'react';
import { ClearOutlined, ExpandOutlined } from '@ant-design/icons';
import { Button, Drawer, Space, Tooltip } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useCopilotChat } from '../../hooks/useCopilotChat';
import { useAssistantTranslation } from '../../i18n/useAssistantTranslation';
import { useLanguage } from '../../i18n/useLanguage';
import copilotService from '../../services/copilot-service';
import type { CopilotStatus } from '../../types/copilot';
import { CopilotComposer } from './CopilotComposer';
import { CopilotThread } from './CopilotThread';
import { getCopilotPageContext } from './copilot-page-context';

export interface CopilotDrawerProps {
  tenantId: string;
  status: CopilotStatus;
  open: boolean;
  onClose(): void;
}

const DRAWER_WIDTH = 440;

const CopilotDrawer: React.FC<CopilotDrawerProps> = ({ tenantId, status, open, onClose }) => {
  const { selected, language, t } = useAssistantTranslation();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { rtl: isRtl } = useLanguage();
  const { isMobile } = useBreakpoint();
  const chat = useCopilotChat(tenantId, true);
  const { stop } = chat;
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [composerVersion, setComposerVersion] = useState(0);
  const inputRef = useRef<TextAreaRef>(null);
  const onAssistantPage = /\/assistant\/?$/.test(pathname);
  const streaming = chat.status === 'streaming';
  const maxChars = status.limits.maxMessageChars || undefined;

  const context = getCopilotPageContext(pathname, search);
  const propertyId = context.activeEntityType === 'PROPERTY' ? context.activeEntityId : undefined;

  // Fermer le tiroir en pleine réponse arrête le flux.
  const handleClose = () => {
    if (streaming) stop();
    onClose();
  };

  // Le tiroir se démonte avec la page : ne laisse jamais un flux orphelin.
  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const openFullPage = (artifactId?: string, version?: number) => {
    const target = new URLSearchParams();
    if (chat.conversationId) target.set('c', chat.conversationId);
    if (artifactId) target.set('resultat', artifactId);
    if (version !== undefined) target.set('version', String(version));
    handleClose();
    navigate({
      pathname: `/tenant/${tenantId}/assistant`,
      search: target.toString()
    });
  };

  const submit = (text: string) => {
    const value = text.trim() || (files.length ? t('Analyse les fichiers joints.') : '');
    if (!value || streaming) return;
    setDraft('');
    setFiles([]);
    void chat.send(value, context, false, files);
  };

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      placement={(selected ? language === 'ar' : isRtl) ? 'left' : 'right'}
      size={isMobile ? '100%' : DRAWER_WIDTH}
      title={t('Assistant ImmoCopilot')}
      keyboard
      afterOpenChange={visible => {
        if (visible) inputRef.current?.focus();
      }}
      extra={
        // Icônes seules : trois libellés à côté du titre débordaient du tiroir (440 px, mobile).
        <Space size={4}>
          {!onAssistantPage && (
            <Tooltip title={t('Ouvrir en pleine page')}>
              <Button
                type="text"
                icon={<ExpandOutlined aria-hidden />}
                aria-label={t('Ouvrir en pleine page')}
                disabled={streaming}
                onClick={() => openFullPage()}
              />
            </Tooltip>
          )}
          <Tooltip title={t('Nouvelle conversation')}>
            <Button
              type="text"
              icon={<ClearOutlined aria-hidden />}
              aria-label={t('Nouvelle conversation')}
              disabled={chat.messages.length === 0 && !draft && files.length === 0}
              onClick={() => {
                chat.reset();
                setDraft('');
                setFiles([]);
                setComposerVersion(version => version + 1);
              }}
            />
          </Tooltip>
        </Space>
      }
      styles={{ body: { display: 'flex', flexDirection: 'column', padding: 0 } }}
    >
      <CopilotThread
        chat={chat}
        tenantId={tenantId}
        status={status}
        pathname={pathname}
        visible={open}
        propertyId={propertyId}
        onSuggestion={submit}
        onOpenArtifact={chat.conversationId && !streaming ? openFullPage : undefined}
      />
      {open && (
        <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <CopilotComposer
            key={composerVersion}
            inputRef={inputRef}
            value={draft}
            onChange={setDraft}
            files={files}
            onFilesChange={setFiles}
            transcribe={
              status.transcription
                ? (audio, signal, durationSeconds) =>
                    copilotService.transcribe(tenantId, audio, signal, durationSeconds)
                : undefined
            }
            onSubmit={submit}
            onStop={() => stop()}
            streaming={streaming}
            maxChars={maxChars}
            maxRows={5}
          />
        </div>
      )}
    </Drawer>
  );
};

export default CopilotDrawer;
