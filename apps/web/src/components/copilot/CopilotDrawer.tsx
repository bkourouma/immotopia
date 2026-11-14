import React, { useEffect, useRef, useState } from 'react';
import { ClearOutlined, ExpandOutlined } from '@ant-design/icons';
import { Button, Drawer, Space, Tooltip } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useCopilotChat } from '../../hooks/useCopilotChat';
import { truncateHelpExcerpt } from '../../help/copilot-bridge';
import { t } from '../../i18n/t';
import { useLanguage } from '../../i18n/useLanguage';
import type { CopilotStatus } from '../../types/copilot';
import { CopilotComposer } from './CopilotComposer';
import { CopilotThread } from './CopilotThread';
import { getCopilotPageContext } from './copilot-page-context';

/** Demande de l'aide interne : brouillon pré-rempli (jamais envoyé) et contexte de la fiche. */
export interface CopilotPrefill {
  draft?: string;
  helpId?: string;
  helpExcerpt?: string;
  /** Change à chaque demande : une même demande répétée réagit. */
  nonce: number;
}

interface HelpContextInfo {
  helpId?: string;
  helpExcerpt?: string;
}

export interface CopilotDrawerProps {
  tenantId: string;
  status: CopilotStatus;
  open: boolean;
  onClose(): void;
  prefill?: CopilotPrefill;
}

const DRAWER_WIDTH = 440;

const CopilotDrawer: React.FC<CopilotDrawerProps> = ({ tenantId, status, open, onClose, prefill }) => {
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

  const [helpInfo, setHelpInfo] = useState<HelpContextInfo | null>(null);
  const handledNonce = useRef<number | null>(null);
  const previousPath = useRef(pathname);

  const baseContext = getCopilotPageContext(pathname);
  const context = helpInfo
    ? {
        ...baseContext,
        helpId: helpInfo.helpId,
        helpExcerpt: helpInfo.helpExcerpt ? truncateHelpExcerpt(helpInfo.helpExcerpt) : undefined
      }
    : baseContext;
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

  // Demande de l'aide : on pré-remplit la saisie, on ne l'envoie jamais.
  useEffect(() => {
    if (!prefill || !open || handledNonce.current === prefill.nonce) return undefined;
    handledNonce.current = prefill.nonce;
    const text = prefill.draft ?? '';
    setDraft(text);
    setHelpInfo(
      prefill.helpId || prefill.helpExcerpt ? { helpId: prefill.helpId, helpExcerpt: prefill.helpExcerpt } : null
    );
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      const field = inputRef.current?.resizableTextArea?.textArea;
      field?.setSelectionRange(text.length, text.length);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [prefill, open]);

  // Le contexte d'aide s'efface à la fermeture du tiroir et au changement de page.
  useEffect(() => {
    if (!open) setHelpInfo(null);
  }, [open]);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    setHelpInfo(null);
  }, [pathname]);

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
        // Icônes seules : trois libellés à côté du titre débordaient du tiroir (440 px, mobile).
        <Space size={4}>
          {!onAssistantPage && (
            <Tooltip title={t('Ouvrir en pleine page')}>
              <Button
                type="text"
                icon={<ExpandOutlined aria-hidden />}
                aria-label={t('Ouvrir en pleine page')}
                onClick={openFullPage}
              />
            </Tooltip>
          )}
          <Tooltip title={t('Nouvelle conversation')}>
            <Button
              type="text"
              icon={<ClearOutlined aria-hidden />}
              aria-label={t('Nouvelle conversation')}
              disabled={chat.messages.length === 0}
              onClick={() => {
                setHelpInfo(null);
                chat.reset();
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
