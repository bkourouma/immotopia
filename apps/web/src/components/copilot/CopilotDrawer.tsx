import React, { useEffect, useRef, useState } from 'react';
import { ClearOutlined, ExpandOutlined } from '@ant-design/icons';
import { Button, Drawer, Space } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useCopilotChat } from '../../hooks/useCopilotChat';
import { t } from '../../i18n/t';
import { useLanguage } from '../../i18n/useLanguage';
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
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { rtl: isRtl } = useLanguage();
  const { isMobile } = useBreakpoint();
  const chat = useCopilotChat(tenantId);
  const { stop } = chat;
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextAreaRef>(null);
  const onAssistantPage = /\/assistant\/?$/.test(pathname);
  const streaming = chat.status === 'streaming';
  const maxChars = status.limits.maxMessageChars || undefined;

  const context = getCopilotPageContext(pathname);
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

  // Le tiroir cède la place à la page : la conversation du tiroir ne la suit pas.
  const openFullPage = () => {
    handleClose();
    navigate(`/tenant/${tenantId}/assistant`);
  };

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
        <Space size="small">
          {!onAssistantPage && (
            <Button type="text" icon={<ExpandOutlined />} onClick={openFullPage}>
              {t('Ouvrir en pleine page')}
            </Button>
          )}
          <Button
            type="text"
            icon={<ClearOutlined />}
            disabled={chat.messages.length === 0}
            onClick={() => chat.reset()}
          >
            {t('Nouvelle conversation')}
          </Button>
        </Space>
      }
      styles={{ body: { display: 'flex', flexDirection: 'column', padding: 0 } }}
    >
      <CopilotThread
        chat={chat}
        tenantId={tenantId}
        status={status}
        pathname={pathname}
        propertyId={propertyId}
        onSuggestion={submit}
      />
      <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
        <CopilotComposer
          inputRef={inputRef}
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          onStop={() => stop()}
          streaming={streaming}
          maxChars={maxChars}
          maxRows={5}
        />
      </div>
    </Drawer>
  );
};

export default CopilotDrawer;
