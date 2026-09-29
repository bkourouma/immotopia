import React, { useEffect, useRef, useState } from 'react';
import { ClearOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Input, Space } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { useLocation } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useCopilotChat } from '../../hooks/useCopilotChat';
import { t } from '../../i18n/t';
import { useLanguage } from '../../i18n/useLanguage';
import type { CopilotStatus } from '../../types/copilot';
import { CopilotMessageList } from './CopilotMessageList';
import { getCopilotPageContext } from './copilot-page-context';
import { getCopilotSuggestions } from './copilot-suggestions';

export interface CopilotDrawerProps {
  tenantId: string;
  status: CopilotStatus;
  open: boolean;
  onClose(): void;
}

const DRAWER_WIDTH = 440;

const CopilotDrawer: React.FC<CopilotDrawerProps> = ({ tenantId, status, open, onClose }) => {
  const { pathname } = useLocation();
  const { rtl: isRtl } = useLanguage();
  const { isMobile } = useBreakpoint();
  const chat = useCopilotChat(tenantId);
  const { stop } = chat;
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextAreaRef>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streaming = chat.status === 'streaming';
  const maxChars = status.limits.maxMessageChars || undefined;

  const context = getCopilotPageContext(pathname);
  const propertyId = context.activeEntityType === 'PROPERTY' ? context.activeEntityId : undefined;
  const suggestions = getCopilotSuggestions(pathname, status.tools);

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

  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight });
  }, [chat.messages]);

  const submit = (text: string) => {
    const value = text.trim();
    if (!value || streaming) return;
    setDraft('');
    void chat.send(value, context);
  };

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      placement={isRtl ? 'left' : 'right'}
      size={isMobile ? '100%' : DRAWER_WIDTH}
      title={t('Assistant ImmoCopilot')}
      keyboard
      afterOpenChange={visible => {
        if (visible) inputRef.current?.focus();
      }}
      extra={
        <Button type="text" icon={<ClearOutlined />} disabled={chat.messages.length === 0} onClick={() => chat.reset()}>
          {t('Nouvelle conversation')}
        </Button>
      }
      styles={{ body: { display: 'flex', flexDirection: 'column', padding: 0 } }}
    >
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)' }}
        role="log"
        aria-live="polite"
        aria-busy={streaming}
      >
        {chat.messages.length === 0 && (
          <div>
            <p>{t('Posez une question sur vos biens, vos baux ou vos documents.')}</p>
            <Space wrap>
              {suggestions.map(s => (
                <Button key={s.id} size="small" onClick={() => submit(s.text)}>
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
        />
        {chat.error && <Alert type="error" showIcon message={chat.error.message} style={{ marginTop: 12 }} />}
      </div>
      <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border-subtle, #f0f0f0)' }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input.TextArea
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit(draft);
              }
            }}
            maxLength={maxChars}
            autoSize={{ minRows: 1, maxRows: 5 }}
            placeholder={t('Écrivez votre message…')}
            aria-label={t('Votre message')}
          />
          {streaming ? (
            <Button icon={<StopOutlined />} onClick={() => stop()} aria-label={t('Arrêter la réponse')} />
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              disabled={!draft.trim()}
              onClick={() => submit(draft)}
              aria-label={t('Envoyer')}
            />
          )}
        </Space.Compact>
      </div>
    </Drawer>
  );
};

export default CopilotDrawer;
