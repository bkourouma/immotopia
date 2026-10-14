import React, { useEffect, useRef, useState } from 'react';
import { ClearOutlined, DatabaseOutlined } from '@ant-design/icons';
import { Button, Drawer, Result, Skeleton, Typography } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { useLocation, useParams } from 'react-router-dom';
import { ArtifactPanel } from '../../components/copilot/artifact/ArtifactPanel';
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
const ARTIFACT_MAX_WIDTH = 680;

/**
 * Hauteur de la page : la fenêtre moins l'en-tête de la coquille (64 px) et les
 * marges de son contenu, pour que seul le fil des messages défile. Sous 992 px
 * la barre d'onglets basse prend sa place (voir `AppShell`, qui réserve
 * `--control-h-lg + --space-6 + zone sûre` sous le contenu). Le bas est
 * parenthésé : sans cela, `a - b + c` AJOUTAIT la réserve au lieu de la retrancher.
 */
export function pageHeight(hasTabs: boolean): string {
  const bottom = hasTabs
    ? '(var(--control-h-lg) + var(--space-6) + env(safe-area-inset-bottom, 0px))'
    : 'var(--page-padding)';
  return `calc(100dvh - 64px - var(--page-padding) - ${bottom})`;
}

/** Pourquoi l'assistant est indisponible, d'après l'état renvoyé par l'API. */
export function unavailableMessage(
  status: CopilotStatus | null,
  hasTenant: boolean
): { title: string; subTitle: string } {
  if (!hasTenant || status?.reason === 'NOT_FOUND') {
    return {
      title: t("Aucune agence n'est rattachée à cette page."),
      subTitle: t("Choisissez une agence pour utiliser l'assistant.")
    };
  }
  if (status?.reason === 'FORBIDDEN') {
    return {
      title: t("L'assistant n'est pas disponible pour ce compte."),
      subTitle: t("Il est réservé aux collaborateurs d'une agence.")
    };
  }
  return {
    title: t("L'assistant n'est pas activé pour cette agence."),
    subTitle: t("Demandez à un administrateur de l'activer.")
  };
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
  const artifactCount = chat.artifacts.length;
  const hasArtifacts = artifactCount > 0;
  // Ordinateur : le panneau apparaît seul à chaque nouvel artefact. Mobile : tiroir,
  // ouvert seulement à la demande (la pastille du message).
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (artifactCount > 0) setDesktopOpen(true);
  }, [artifactCount, chat.selectedArtifactId]);
  useEffect(() => {
    if (artifactCount === 0) setDrawerOpen(false);
  }, [artifactCount]);

  const openArtifact = (id: string) => {
    chat.selectArtifact(id);
    setDesktopOpen(true);
    setDrawerOpen(true);
  };
  const closePanel = () => {
    setDesktopOpen(false);
    setDrawerOpen(false);
  };
  const panel = (
    <ArtifactPanel
      artifacts={chat.artifacts}
      selectedId={chat.selectedArtifactId}
      onSelect={chat.selectArtifact}
      onClose={closePanel}
    />
  );

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasArtifacts && (showArtifact ? !desktopOpen : true) && (
              <Button
                type="text"
                icon={<DatabaseOutlined aria-hidden />}
                onClick={() => (showArtifact ? setDesktopOpen(true) : setDrawerOpen(true))}
              >
                {t('Résultats ({{count}})', { count: artifactCount })}
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
          </div>
        </div>
        <CopilotThread
          chat={chat}
          tenantId={tenantId}
          status={status}
          pathname={pathname}
          onSuggestion={submit}
          maxWidth={READING_WIDTH}
          onOpenArtifact={openArtifact}
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
      {showArtifact && desktopOpen && hasArtifacts && (
        <aside
          aria-label={t('Résultats et documents')}
          style={{
            flex: `0 0 clamp(${ARTIFACT_WIDTH}px, 42%, ${ARTIFACT_MAX_WIDTH}px)`,
            minWidth: 0,
            padding: 'var(--space-4)',
            border: '1px solid var(--border-subtle, #d9d9d9)',
            borderRadius: 'var(--radius-lg, 12px)',
            background: 'var(--surface-card, transparent)'
          }}
        >
          {panel}
        </aside>
      )}
      {!showArtifact && (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={t('Résultats et documents')}
          placement="right"
          size="100%"
          destroyOnHidden
        >
          {panel}
        </Drawer>
      )}
    </div>
  );
};

/**
 * Page de chat plein écran d'ImmoCopilot (`/tenant/:tenantId/assistant`).
 * Même conversation que le tiroir, mais fil en haut, saisie fixée en bas et
 * panneau d'artefacts à droite (tiroir plein écran sous 992 px).
 */
const AssistantPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { isDesktop } = useBreakpoint();
  const status = useCopilotStatus(tenantId);

  if (!tenantId) return <Result status="info" {...unavailableMessage(null, false)} />;
  if (!status) return <Skeleton active aria-label={t("Chargement de l'écran")} />;
  if (!status.enabled) return <Result status="info" {...unavailableMessage(status, true)} />;
  return <ChatPane tenantId={tenantId} status={status} hasTabs={!isDesktop} showArtifact={isDesktop} />;
};

export default AssistantPage;
