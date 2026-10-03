import React, { useEffect, useRef, useState } from 'react';
import { ClearOutlined } from '@ant-design/icons';
import { Button, Result, Skeleton, Typography } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { useLocation, useParams } from 'react-router-dom';
import { CopilotComposer } from '../../components/copilot/CopilotComposer';
import { CopilotThread } from '../../components/copilot/CopilotThread';
import { getCopilotPageContext } from '../../components/copilot/copilot-page-context';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useCopilotChat } from '../../hooks/useCopilotChat';
import { useCopilotStatus } from '../../hooks/useCopilotStatus';
import { t } from '../../i18n/t';
import type { CopilotStatus } from '../../types/copilot';

/** Colonne de lecture : les messages ne s'étirent pas sur tout un grand écran. */
const READING_WIDTH = 820;
const ARTIFACT_WIDTH = 380;

/**
 * Hauteur de la page : la fenêtre moins l'en-tête de la coquille (64 px) et les
 * marges de son contenu, pour que seul le fil des messages défile. Sous 992 px
 * la barre d'onglets basse prend sa place (voir `AppShell`).
 */
function pageHeight(hasTabs: boolean): string {
  const bottom = hasTabs
    ? 'var(--control-h-lg) + var(--space-6) + env(safe-area-inset-bottom, 0px)'
    : 'var(--page-padding)';
  return `calc(100dvh - 64px - var(--page-padding) - ${bottom})`;
}

const ChatPane: React.FC<{ tenantId: string; status: CopilotStatus; hasTabs: boolean; showArtifact: boolean }> = ({
  tenantId,
  status,
  hasTabs,
  showArtifact
}) => {
  const { pathname } = useLocation();
  const chat = useCopilotChat(tenantId);
  const { stop } = chat;
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextAreaRef>(null);
  const streaming = chat.status === 'streaming';
  const context = getCopilotPageContext(pathname);

  // Quitter la page arrête le flux en cours.
  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (text: string) => {
    const value = text.trim();
    if (!value || streaming) return;
    setDraft('');
    void chat.send(value, context);
  };

  return (
    <div style={{ display: 'flex', height: pageHeight(hasTabs), minHeight: 320, gap: 'var(--space-4)' }}>
      <section
        aria-label={t('Conversation')}
        style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t('Assistant')}
          </Typography.Title>
          <Button
            type="text"
            icon={<ClearOutlined />}
            disabled={chat.messages.length === 0}
            onClick={() => chat.reset()}
          >
            {t('Nouvelle conversation')}
          </Button>
        </div>
        <CopilotThread
          chat={chat}
          tenantId={tenantId}
          status={status}
          pathname={pathname}
          onSuggestion={submit}
          maxWidth={READING_WIDTH}
        />
        <div
          style={{ width: '100%', maxWidth: READING_WIDTH, marginInline: 'auto', paddingBlockStart: 'var(--space-2)' }}
        >
          <CopilotComposer
            inputRef={inputRef}
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            onStop={() => stop()}
            streaming={streaming}
            maxChars={status.limits.maxMessageChars || undefined}
          />
        </div>
      </section>
      {showArtifact && (
        <aside
          aria-label={t('Résultats et documents')}
          style={{
            flex: `0 0 ${ARTIFACT_WIDTH}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-4)',
            textAlign: 'center',
            border: '1px dashed var(--border-subtle, #d9d9d9)',
            borderRadius: 'var(--radius-lg, 12px)'
          }}
        >
          <Typography.Text type="secondary">
            {t('Les tableaux, textes et graphiques générés par l’assistant apparaîtront ici.')}
          </Typography.Text>
        </aside>
      )}
    </div>
  );
};

/**
 * Page de chat plein écran d'ImmoCopilot (`/tenant/:tenantId/assistant`).
 * Même conversation que le tiroir, mais fil en haut, saisie fixée en bas et
 * emplacement de l'artefact à droite (replié sous 992 px).
 */
const AssistantPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { isDesktop } = useBreakpoint();
  const status = useCopilotStatus(tenantId);

  if (!tenantId || !status) return <Skeleton active aria-label={t("Chargement de l'écran")} />;
  if (!status.enabled) {
    return (
      <Result
        status="info"
        title={t("L'assistant n'est pas activé pour cette agence.")}
        subTitle={t("Demandez à un administrateur de l'activer.")}
      />
    );
  }
  return <ChatPane tenantId={tenantId} status={status} hasTabs={!isDesktop} showArtifact={isDesktop} />;
};

export default AssistantPage;
