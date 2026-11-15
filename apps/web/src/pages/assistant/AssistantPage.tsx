import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ClearOutlined, DatabaseOutlined } from '@ant-design/icons';
import { Button, ConfigProvider, Drawer, Modal, Result, Skeleton, Switch, Typography } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ConversationHistory } from '../../components/copilot/ConversationHistory';
import { SavedAnalyses } from '../../components/copilot/SavedAnalyses';
import { AnalysisShares } from '../../components/copilot/AnalysisShares';
import { ShareAnalysisDialog } from '../../components/copilot/ShareAnalysisDialog';
import { ScheduledReports } from '../../components/copilot/ScheduledReports';
import { RentalAlerts } from '../../components/copilot/RentalAlerts';
import { AssistantTasks } from '../../components/copilot/AssistantTasks';
import { CreateAssistantTaskDialog } from '../../components/copilot/CreateAssistantTaskDialog';
import { NotifyColleaguesDialog } from '../../components/copilot/NotifyColleaguesDialog';
import { copilotService, type SavedAnalysis } from '../../services/copilot-service';
import { feedback } from '../../lib/feedback';
import { ArtifactPanel } from '../../components/copilot/artifact/ArtifactPanel';
import { filenameFromDisposition, saveBlob } from '../../utils/save-blob';
import { sanitizeArtifact } from '../../utils/copilot-artifact';
import { CopilotComposer } from '../../components/copilot/CopilotComposer';
import { CopilotThread } from '../../components/copilot/CopilotThread';
import { getCopilotPageContext } from '../../components/copilot/copilot-page-context';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useCopilotChat } from '../../hooks/useCopilotChat';
import { useCopilotStatus } from '../../hooks/useCopilotStatus';
import { t } from '../../i18n/t';
import { assistantLanguageCodes, assistantLanguages, isAssistantLanguage } from '../../i18n/assistant-language';
import { assistantComponentLocales } from '../../i18n/assistant-component-locales';
import { useAssistantTranslation } from '../../i18n/useAssistantTranslation';
import type { AssistantBriefingItem, CopilotStatus } from '../../types/copilot';
import {
  MAX_RESULT_WIDTH,
  MIN_RESULT_WIDTH,
  ResultPaneDivider,
  readResultWidth,
  saveResultWidth
} from './ResultPaneDivider';
import './result-pane.css';

/** Colonne de lecture : les messages ne s'étirent pas sur tout un grand écran. */
const READING_WIDTH = 820;

function cycleResultFocus(event: React.KeyboardEvent<HTMLDivElement>) {
  const { currentTarget, target, shiftKey } = event;
  if (event.key !== 'Tab' || !(target instanceof HTMLElement) || !currentTarget.contains(target)) return;
  const controls = Array.from(
    currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex]')
  ).filter(control => control.tabIndex >= 0 && !control.matches(':disabled') && control.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last || target !== (shiftKey ? first : last)) return;
  event.preventDefault();
  (shiftKey ? last : first).focus();
}

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

const ChatPane: React.FC<{ tenantId: string; status: CopilotStatus; hasTabs: boolean; dockResults: boolean }> = ({
  tenantId,
  status,
  hasTabs,
  dockResults
}) => {
  const { language, selected, t } = useAssistantTranslation();
  const [savingLanguage, setSavingLanguage] = useState(false);
  async function changeLanguage(value: string) {
    setSavingLanguage(true);
    try {
      await copilotService.savePreferredLanguage(isAssistantLanguage(value) ? value : null);
    } catch {
      feedback.error(t('La langue de l’assistant n’a pas pu être enregistrée.'));
    } finally {
      setSavingLanguage(false);
    }
  }
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();
  const dispatchedPrompt = useRef<string>();
  const chat = useCopilotChat(tenantId, true);
  const { conversationId, restoreConversation, reset, selectArtifact, artifacts } = chat;
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c');
  const requestedArtifact = params.get('resultat');
  const versionParam = Number(params.get('version'));
  const requestedVersion = Number.isSafeInteger(versionParam) && versionParam > 0 ? versionParam : undefined;
  const sharedId = params.get('partage');
  const reportsOpen = params.get('rapports') === '1';
  const rentalAlertsOpen = params.get('alertes-locatives') === '1';
  const canOpenRentalAlerts = status.tools.some(tool =>
    ['prepare_lease_expiry_alert', 'prepare_declaration_alert', 'prepare_rent_arrears_alert'].includes(tool)
  );
  const taskId = params.get('tache') ?? undefined;
  const tasksOpen = !!taskId || params.get('taches') === '1';
  const [taskDraft, setTaskDraft] = useState<{ analysis?: SavedAnalysis }>();
  const [notificationDraft, setNotificationDraft] = useState<{ analysis?: SavedAnalysis }>();
  function closeRentalAlerts(closeDrawer: boolean) {
    setParams(
      previous => {
        const next = new URLSearchParams(previous);
        for (const key of ['regle', 'jours', 'bien', 'minimum', 'devise']) next.delete(key);
        if (closeDrawer) next.delete('alertes-locatives');
        return next;
      },
      { replace: true }
    );
  }
  const analysisConversation = params.get('fil');
  const analysisArtifact = params.get('analyse');
  const initialAnalysis =
    analysisConversation && analysisArtifact
      ? { conversationId: analysisConversation, artifactId: analysisArtifact }
      : undefined;
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [analysesOpen, setAnalysesOpen] = useState(false);
  const setReportsOpen = (open: boolean) =>
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (open) next.set('rapports', '1');
      else next.delete('rapports');
      return next;
    });
  const [sharesOpen, setSharesOpen] = useState(false);
  const [sharedConversation, setSharedConversation] = useState<string>();
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [archivedThread, setArchivedThread] = useState(false);
  const [briefing, setBriefing] = useState<AssistantBriefingItem[]>([]);
  const [showBriefing, setShowBriefing] = useState(false);
  const [deep, setDeep] = useState(false);
  const selectConversation = (id: string | null) => {
    reset();
    setArchivedThread(false);
    setDraft('');
    setFiles([]);
    setFocus(undefined);
    setHistoryOpen(false);
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (id) next.set('c', id);
      else next.delete('c');
      next.delete('resultat');
      next.delete('version');
      return next;
    });
  };
  useEffect(() => {
    if (!activeId || activeId === conversationId || !restoreConversation) {
      setLoadingHistory(false);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    void copilotService
      .getConversation(tenantId, activeId)
      .then(conversation => {
        if (cancelled) return;
        restoreConversation(conversation);
        setArchivedThread(conversation.archived);
      })
      .catch(() => {
        if (!cancelled) feedback.error(t('Cette conversation n’est pas disponible.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, conversationId, restoreConversation, tenantId]);
  useEffect(() => {
    if (!activeId && conversationId) {
      setParams(
        previous => {
          const next = new URLSearchParams(previous);
          next.set('c', conversationId);
          return next;
        },
        { replace: true }
      );
    }
  }, [activeId, conversationId, setParams]);
  const isNewConversation = !activeId;
  useEffect(() => {
    setBriefing([]);
    setShowBriefing(false);
    if (!isNewConversation) return;
    const controller = new AbortController();
    void copilotService
      .getBriefing(tenantId, controller.signal)
      .then(items => {
        if (!controller.signal.aborted) setBriefing(items);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [isNewConversation, tenantId, language]);
  const { stop } = chat;
  const [draft, setDraft] = useState('');
  const [focus, setFocus] = useState<{ artifactId: string; version: number; title: string }>();
  useEffect(() => setFocus(undefined), [activeId, tenantId]);
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<TextAreaRef>(null);
  const [regenerating, setRegenerating] = useState(false);
  const regeneration = useRef<AbortController>();
  useEffect(() => {
    setRegenerating(false);
    return () => {
      regeneration.current?.abort();
      regeneration.current = undefined;
    };
  }, [activeId, tenantId]);
  const streaming = regenerating || chat.status === 'streaming';
  const context = getCopilotPageContext(pathname);
  const send = chat.send;
  useEffect(() => {
    const launch = location.state as { prompt?: string; sourcePath?: string } | null;
    if (activeId || !launch?.prompt || dispatchedPrompt.current === location.key) return;
    dispatchedPrompt.current = location.key;
    navigate(pathname, { replace: true, state: null });
    const origin = launch.sourcePath?.startsWith(`/tenant/${tenantId}/`) ? launch.sourcePath : pathname;
    const [originPath, originQuery] = origin.split('?', 2);
    void send(launch.prompt, getCopilotPageContext(originPath, originQuery)).finally(() =>
      setHistoryRefresh(value => value + 1)
    );
  }, [activeId, location.key, location.state, navigate, pathname, send, tenantId]);
  const artifactCount = artifacts.length;
  const hasArtifacts = artifactCount > 0;
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [savedWidth, setSavedWidth] = useState(readResultWidth);
  const [maxWidth, setMaxWidth] = useState(MAX_RESULT_WIDTH);
  const frameRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const historyRef = useRef<HTMLElement>(null);
  const conversationRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement>();
  const desktopFocusFrame = useRef<number>();
  const resultsRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const dockId = useId();
  const width = Math.min(savedWidth, maxWidth);
  useEffect(
    () => () => {
      if (desktopFocusFrame.current !== undefined) cancelAnimationFrame(desktopFocusFrame.current);
    },
    []
  );
  useEffect(() => {
    const locked = expanded || (!dockResults && drawerOpen);
    historyRef.current?.toggleAttribute('inert', locked);
    conversationRef.current?.toggleAttribute('inert', locked);
  }, [dockResults, drawerOpen, expanded]);
  useEffect(() => {
    const frame = frameRef.current;
    if (!dockResults || !frame || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      // La zone de conversation démarre après l’historique et l’espacement.
      const usable = entry.contentRect.width - 246;
      setMaxWidth(Math.max(MIN_RESULT_WIDTH, Math.min(MAX_RESULT_WIDTH, Math.floor(usable * 0.6))));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [dockResults]);
  useEffect(() => {
    if (!dockResults || !hasArtifacts) setExpanded(false);
  }, [dockResults, hasArtifacts]);
  useEffect(() => {
    if (artifactCount > 0) setDesktopOpen(true);
  }, [artifactCount, chat.selectedArtifactId]);
  useEffect(() => {
    if (artifactCount === 0) setDrawerOpen(false);
  }, [artifactCount]);

  const [versionLink, setVersionLink] = useState<{ id: string; version?: number; request: number }>();
  const viewedVersion = useRef<{ id: string; version?: number }>();
  const onViewVersion = useCallback((id: string, version?: number) => {
    viewedVersion.current = { id, version };
  }, []);
  const rememberVersion = () => {
    const view = viewedVersion.current;
    if (view) setVersionLink(previous => ({ ...view, request: previous?.request ?? 0 }));
  };
  const openResults = useCallback(() => {
    const trigger = document.activeElement;
    triggerRef.current = trigger instanceof HTMLElement && trigger !== document.body ? trigger : undefined;
    if (dockResults) {
      if (desktopFocusFrame.current !== undefined) cancelAnimationFrame(desktopFocusFrame.current);
      setDesktopOpen(true);
      desktopFocusFrame.current = requestAnimationFrame(() => {
        desktopFocusFrame.current = undefined;
        dockRef.current?.focus();
      });
    } else setDrawerOpen(true);
  }, [dockResults]);
  const openArtifact = useCallback(
    (id: string, version?: number) => {
      setVersionLink(previous => ({ id, version, request: (previous?.request ?? 0) + 1 }));
      selectArtifact(id);
      openResults();
    },
    [openResults, selectArtifact]
  );
  const openedResultLink = useRef<string>();
  useEffect(() => {
    if (!activeId || !requestedArtifact) {
      openedResultLink.current = undefined;
      return;
    }
    const link = JSON.stringify([activeId, requestedArtifact, requestedVersion]);
    if (openedResultLink.current === link || conversationId !== activeId) return;
    if (!artifacts.some(artifact => artifact.id === requestedArtifact)) return;
    openedResultLink.current = link;
    openArtifact(requestedArtifact, requestedVersion);
  }, [activeId, artifacts, conversationId, openArtifact, requestedArtifact, requestedVersion]);
  const restorePanelFocus = (clear = true) => {
    const trigger = triggerRef.current;
    if (clear) triggerRef.current = undefined;
    if (trigger?.isConnected) trigger.focus();
    else if (resultsRef.current) resultsRef.current.focus();
    else inputRef.current?.focus();
  };
  const focusExpand = () => requestAnimationFrame(() => expandRef.current?.focus());
  const collapse = () => {
    rememberVersion();
    setExpanded(false);
    focusExpand();
  };
  const closePanel = () => {
    if (expanded) {
      collapse();
    } else if (dockResults) {
      if (desktopFocusFrame.current !== undefined) cancelAnimationFrame(desktopFocusFrame.current);
      setDesktopOpen(false);
      desktopFocusFrame.current = requestAnimationFrame(() => {
        desktopFocusFrame.current = undefined;
        restorePanelFocus();
      });
    } else {
      setDrawerOpen(false);
      requestAnimationFrame(() => restorePanelFocus(false));
    }
  };
  const readVersion = useCallback(
    async (artifactId: string, version?: number) => {
      if (!conversationId) throw new Error(t('Cette version est indisponible.'));
      const result = await copilotService.getArtifactVersion(tenantId, conversationId, artifactId, version);
      const artifact = sanitizeArtifact(result.artifact);
      if (!artifact || artifact.id !== artifactId) throw new Error(t('Cette version est indisponible.'));
      return { ...result, artifact };
    },
    [conversationId, tenantId]
  );
  const panel = (
    <ArtifactPanel
      requireServerForData
      key={`${conversationId ?? ''}:${versionLink?.request ?? 0}`}
      initialVersion={versionLink?.id === chat.selectedArtifactId ? versionLink?.version : undefined}
      onReadVersion={conversationId && !streaming ? readVersion : undefined}
      artifacts={chat.artifacts}
      selectedId={chat.selectedArtifactId}
      onSelect={chat.selectArtifact}
      onClose={closePanel}
      onExpand={
        dockResults && !expanded
          ? () => {
              rememberVersion();
              setExpanded(true);
            }
          : undefined
      }
      expandButtonRef={expandRef}
      onViewVersion={onViewVersion}
      onSaveAnalysis={
        conversationId && !streaming
          ? async artifactId => {
              await copilotService.saveAnalysis(tenantId, { conversationId, artifactId });
              feedback.success(t('Analyse enregistrée.'));
            }
          : undefined
      }
      onFollowUp={
        conversationId && !streaming && !archivedThread
          ? (artifact, version) => {
              setFocus({ artifactId: artifact.id, version, title: artifact.title });
              setDraft(previous => previous || t('Explique les points importants de ce résultat.'));
              setExpanded(false);
              setDesktopOpen(false);
              setDrawerOpen(false);
              triggerRef.current = undefined;
              requestAnimationFrame(() => inputRef.current?.focus());
            }
          : undefined
      }
      onRefresh={
        conversationId && !streaming && chat.replaceArtifact
          ? async (artifactId, expectedVersion = 1) => {
              const artifact = sanitizeArtifact(
                (await copilotService.updateArtifactVersion(tenantId, conversationId, artifactId, { expectedVersion }))
                  .artifact
              );
              if (!artifact || artifact.id !== artifactId)
                throw new Error(t('Cette analyse ne peut pas être recalculée.'));
              chat.replaceArtifact?.(artifact, conversationId);
            }
          : undefined
      }
      onRewriteSection={
        conversationId && !streaming && !archivedThread
          ? (artifactId, change) => copilotService.rewriteArtifactSection(tenantId, conversationId, artifactId, change)
          : undefined
      }
      onEditVersion={
        conversationId && !streaming && chat.replaceArtifact
          ? async (artifactId, change) => {
              const result = await copilotService.updateArtifactVersion(tenantId, conversationId, artifactId, change);
              const artifact = sanitizeArtifact(result.artifact);
              if (!artifact || artifact.id !== artifactId) throw new Error(t('Cette version est indisponible.'));
              chat.replaceArtifact?.(artifact, conversationId);
            }
          : undefined
      }
      onDownloadFile={
        conversationId && !streaming
          ? async (artifactId, format, version) => {
              const file = await copilotService.downloadArtifact(tenantId, conversationId, artifactId, format, version);
              saveBlob(file.data, filenameFromDisposition(file.headers['content-disposition'], `ImmoTopia.${format}`));
            }
          : undefined
      }
    />
  );

  // Quitter la page arrête le flux en cours.
  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.key.toLowerCase() !== 'n' || event.isComposing) return;
      event.preventDefault();
      reset();
      setArchivedThread(false);
      setDraft('');
      setFiles([]);
      setFocus(undefined);
      navigate(pathname);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, pathname, reset]);

  const lastQuestion = [...chat.messages].reverse().find(message => message.role === 'user');
  const canRegenerate =
    conversationId &&
    activeId === conversationId &&
    !archivedThread &&
    !loadingHistory &&
    !streaming &&
    lastQuestion &&
    chat.messages.at(-1)?.role === 'assistant';

  async function regenerate() {
    if (!canRegenerate || !conversationId || !lastQuestion || !restoreConversation || regeneration.current) return;
    const controller = new AbortController();
    regeneration.current = controller;
    setRegenerating(true);
    try {
      let succeeded = false;
      await copilotService.streamChat(
        tenantId,
        {
          conversationId,
          regenerateTurnId: lastQuestion.id,
          messages: [{ role: 'user', content: lastQuestion.text }],
          deep
        },
        {
          signal: controller.signal,
          onEvent: event => {
            if (event.type === 'done') succeeded = event.reason === 'end_turn';
          }
        }
      );
      if (!succeeded) throw new Error();
      const updated = await copilotService.getConversation(tenantId, conversationId);
      if (regeneration.current === controller) restoreConversation(updated);
    } catch {
      if (!controller.signal.aborted) feedback.error(t('La réponse n’a pas pu être régénérée.'));
    } finally {
      if (regeneration.current === controller) {
        regeneration.current = undefined;
        setRegenerating(false);
      }
    }
  }

  const submit = (text: string) => {
    const value = text.trim() || (files.length ? t('Analyse les fichiers joints.') : '');
    if (!value || streaming || loadingHistory || archivedThread || (activeId && activeId !== conversationId)) return;
    setDraft('');
    setFiles([]);
    setFocus(undefined);
    const request = focus
      ? chat.send(value, context, deep, files, { artifactId: focus.artifactId, version: focus.version })
      : files.length
        ? chat.send(value, context, deep, files)
        : chat.send(value, context, deep);
    void request.finally(() => {
      setHistoryRefresh(value => value + 1);
    });
  };

  const history = (
    <ConversationHistory
      tenantId={tenantId}
      activeId={activeId}
      disabled={streaming}
      refresh={historyRefresh}
      onSelect={selectConversation}
      onArchive={(id, archived) => {
        if (id === activeId) setArchivedThread(archived);
      }}
    />
  );

  const direction = language === 'ar' ? 'rtl' : 'ltr';
  return (
    <div
      ref={frameRef}
      dir={direction}
      lang={language}
      style={{ display: 'flex', height: pageHeight(hasTabs), minHeight: 320, gap: 'var(--space-4)' }}
    >
      {sharedConversation && (
        <ShareAnalysisDialog
          tenantId={tenantId}
          reference={{ conversationId: sharedConversation }}
          onClose={() => setSharedConversation(undefined)}
        />
      )}
      {(analysesOpen || initialAnalysis) && (
        <SavedAnalyses
          key={analysisArtifact ?? ''}
          tenantId={tenantId}
          agencyTimeZone={status.agencyTimeZone}
          initialAnalysis={initialAnalysis}
          onCreateTask={analysis => setTaskDraft({ analysis })}
          onNotify={analysis => setNotificationDraft({ analysis })}
          onReportCreated={() => {
            setAnalysesOpen(false);
            setParams(previous => {
              const next = new URLSearchParams(previous);
              next.delete('fil');
              next.delete('analyse');
              next.set('rapports', '1');
              return next;
            });
          }}
          onClose={() => {
            setAnalysesOpen(false);
            if (initialAnalysis)
              setParams(
                previous => {
                  const next = new URLSearchParams(previous);
                  next.delete('fil');
                  next.delete('analyse');
                  return next;
                },
                { replace: true }
              );
          }}
        />
      )}
      {reportsOpen && <ScheduledReports tenantId={tenantId} onClose={() => setReportsOpen(false)} />}
      {rentalAlertsOpen && (
        <RentalAlerts
          tenantId={tenantId}
          tools={status.tools}
          params={params}
          onClose={() => closeRentalAlerts(true)}
          onDraftClosed={() => closeRentalAlerts(false)}
        />
      )}
      {notificationDraft && (
        <NotifyColleaguesDialog
          tenantId={tenantId}
          analysis={notificationDraft.analysis}
          onClose={() => setNotificationDraft(undefined)}
        />
      )}
      {tasksOpen && (
        <AssistantTasks
          key={taskId ?? ''}
          tenantId={tenantId}
          focus={taskId}
          onCreate={() => setTaskDraft({})}
          onClose={() =>
            setParams(previous => {
              const next = new URLSearchParams(previous);
              next.delete('taches');
              next.delete('tache');
              return next;
            })
          }
        />
      )}
      {taskDraft && (
        <CreateAssistantTaskDialog
          tenantId={tenantId}
          analysis={taskDraft.analysis}
          onClose={() => setTaskDraft(undefined)}
          onCreated={id => {
            setTaskDraft(undefined);
            setAnalysesOpen(false);
            setParams(previous => {
              const next = new URLSearchParams(previous);
              next.delete('fil');
              next.delete('analyse');
              next.delete('taches');
              next.set('tache', id);
              return next;
            });
          }}
        />
      )}
      {(sharesOpen || sharedId) && (
        <AnalysisShares
          key={sharedId ?? ''}
          tenantId={tenantId}
          initialShareId={sharedId ?? undefined}
          onClose={() => {
            setSharesOpen(false);
            if (sharedId)
              setParams(
                previous => {
                  const next = new URLSearchParams(previous);
                  next.delete('partage');
                  return next;
                },
                { replace: true }
              );
          }}
        />
      )}
      {!hasTabs ? (
        <nav ref={historyRef} aria-label={t('Historique des conversations')} style={{ flex: '0 0 230px', minWidth: 0 }}>
          {history}
        </nav>
      ) : (
        <Drawer
          title={t('Historique des conversations')}
          placement={direction === 'rtl' ? 'right' : 'left'}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
        >
          {history}
        </Drawer>
      )}
      <section
        ref={conversationRef}
        aria-label={t('Conversation')}
        style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
        >
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t('Assistant')}
          </Typography.Title>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
            <select
              aria-label={t('Langue de l’assistant')}
              value={selected ?? ''}
              disabled={streaming || savingLanguage}
              onChange={event => void changeLanguage(event.target.value)}
              style={{
                maxInlineSize: '100%',
                minBlockSize: 32,
                border: '1px solid var(--border-subtle, #d9d9d9)',
                borderRadius: 6,
                background: 'var(--surface-card, #fff)',
                color: 'inherit'
              }}
            >
              <option value="">{t('Langue de l’interface')}</option>
              {assistantLanguageCodes.map(code => (
                <option value={code} key={code} lang={code}>
                  {assistantLanguages[code].label}
                </option>
              ))}
            </select>
            <Button type="text" onClick={() => setAnalysesOpen(true)}>
              {t('Mes analyses')}
            </Button>
            <Button type="text" onClick={() => setSharesOpen(true)}>
              {t('Partages')}
            </Button>
            <Button type="text" onClick={() => setReportsOpen(true)}>
              {t('Rapports')}
            </Button>
            {canOpenRentalAlerts && (
              <Button
                type="text"
                onClick={() =>
                  setParams(previous => {
                    const next = new URLSearchParams(previous);
                    next.set('alertes-locatives', '1');
                    return next;
                  })
                }
              >
                {t('Alertes locatives')}
              </Button>
            )}
            <Button type="text" onClick={() => setNotificationDraft({})}>
              {t('Notifier des collègues')}
            </Button>
            <Button
              type="text"
              onClick={() =>
                setParams(previous => {
                  const next = new URLSearchParams(previous);
                  next.set('taches', '1');
                  return next;
                })
              }
            >
              {t('Tâches')}
            </Button>
            {conversationId && activeId === conversationId && !streaming && (
              <Button type="text" onClick={() => setSharedConversation(conversationId)}>
                {t('Partager la conversation')}
              </Button>
            )}
            {hasTabs && (
              <Button type="text" onClick={() => setHistoryOpen(true)}>
                {t('Historique')}
              </Button>
            )}
            {hasArtifacts && (!dockResults || !desktopOpen) && (
              <Button type="text" icon={<DatabaseOutlined aria-hidden />} ref={resultsRef} onClick={openResults}>
                {t('Résultats ({{count}})', { count: artifactCount })}
              </Button>
            )}
            <Button
              type="text"
              icon={<ClearOutlined />}
              disabled={chat.messages.length === 0 && !activeId}
              onClick={() => selectConversation(null)}
            >
              {t('Nouvelle conversation')}
            </Button>
          </div>
        </div>
        {!activeId && chat.messages.length === 0 && briefing.length > 0 && (
          <section aria-label={t('Briefing du jour')} style={{ maxHeight: '36%', overflowY: 'auto', paddingBlock: 8 }}>
            <Typography.Title level={5}>{t('Briefing du jour')}</Typography.Title>
            <ul style={{ paddingInlineStart: 20 }}>
              {briefing.slice(0, showBriefing ? briefing.length : 6).map(task => (
                <li key={task.id} style={{ marginBlockEnd: 8 }}>
                  <Link to={task.href}>{task.title}</Link>
                  <Typography.Text type="secondary" style={{ display: 'block' }}>
                    {task.description}
                  </Typography.Text>
                </li>
              ))}
            </ul>
            {briefing.length > 6 && (
              <Button type="link" aria-expanded={showBriefing} onClick={() => setShowBriefing(value => !value)}>
                {showBriefing ? t('Voir moins') : t('Voir tout')}
              </Button>
            )}
          </section>
        )}
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
          {loadingHistory ? (
            <Skeleton active paragraph={false} />
          ) : archivedThread ? (
            <Typography.Text type="secondary">{t('Cette conversation est archivée.')}</Typography.Text>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBlockEnd: 8 }}>
                <Switch
                  size="small"
                  checked={deep}
                  onChange={setDeep}
                  disabled={streaming}
                  aria-label={t('Analyse approfondie')}
                />
                {t('Analyse approfondie')}
              </label>
              {(canRegenerate || regenerating) && (
                <Button size="small" loading={regenerating} onClick={() => void regenerate()}>
                  {t('Régénérer la dernière réponse')}
                </Button>
              )}
              {focus && (
                <Button
                  type="text"
                  onClick={() => setFocus(undefined)}
                  aria-label={t('Retirer le résultat de la question')}
                >
                  {focus.title} ×
                </Button>
              )}
              <CopilotComposer
                key={activeId ?? 'new'}
                transcribe={
                  status.transcription
                    ? (audio, signal, durationSeconds) =>
                        copilotService.transcribe(tenantId, audio, signal, durationSeconds)
                    : undefined
                }
                inputRef={inputRef}
                value={draft}
                onChange={setDraft}
                files={files}
                onFilesChange={setFiles}
                onSubmit={submit}
                onStop={() => {
                  if (regeneration.current) regeneration.current.abort();
                  else stop();
                }}
                streaming={streaming}
                maxChars={status.limits.maxMessageChars || undefined}
              />
            </>
          )}
        </div>
      </section>
      {dockResults && desktopOpen && hasArtifacts && !expanded && (
        <aside
          ref={dockRef}
          id={dockId}
          tabIndex={-1}
          aria-label={t('Résultats et documents')}
          style={{
            position: 'relative',
            flex: `0 0 ${width}px`,
            minWidth: 0,
            padding: 'var(--space-4)',
            border: '1px solid var(--border-subtle, #d9d9d9)',
            borderRadius: 'var(--radius-lg, 12px)',
            background: 'var(--surface-card, transparent)'
          }}
        >
          <ResultPaneDivider
            label={t('Redimensionner le panneau de résultats')}
            width={width}
            maximum={maxWidth}
            rtl={direction === 'rtl'}
            controls={dockId}
            onResize={value => {
              setSavedWidth(value);
              saveResultWidth(value);
            }}
          />
          {panel}
        </aside>
      )}
      {dockResults && (
        <Modal
          open={expanded}
          title={t('Résultats et documents')}
          onCancel={collapse}
          afterOpenChange={open => {
            if (!open) focusExpand();
          }}
          focusable={{ trap: true, focusTriggerAfterClose: false }}
          footer={null}
          closable={false}
          width="calc(100vw - 32px)"
          style={{ top: 16 }}
          styles={{ wrapper: { position: 'fixed' }, body: { height: 'calc(100dvh - 116px)' } }}
          destroyOnHidden
        >
          {expanded && (
            <div onKeyDown={cycleResultFocus} style={{ height: '100%' }}>
              {panel}
            </div>
          )}
        </Modal>
      )}
      {!dockResults && (
        <Drawer
          open={drawerOpen}
          onClose={closePanel}
          afterOpenChange={open => {
            if (!open && triggerRef.current) requestAnimationFrame(() => restorePanelFocus());
          }}
          title={t('Résultats et documents')}
          placement={direction === 'rtl' ? 'left' : 'right'}
          size={hasTabs ? '100%' : 'min(720px, 100%)'}
          focusable={{ trap: true, focusTriggerAfterClose: false }}
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
  const { isDesktop, screens } = useBreakpoint();
  const status = useCopilotStatus(tenantId);
  const { language } = useAssistantTranslation();

  if (!tenantId) return <Result status="info" {...unavailableMessage(null, false)} />;
  if (!status) return <Skeleton active aria-label={t("Chargement de l'écran")} />;
  if (!status.enabled) return <Result status="info" {...unavailableMessage(status, true)} />;
  return (
    <ConfigProvider direction={language === 'ar' ? 'rtl' : 'ltr'} locale={assistantComponentLocales[language]}>
      <ChatPane
        key={tenantId}
        tenantId={tenantId}
        status={status}
        hasTabs={!isDesktop}
        dockResults={Boolean(screens.xl)}
      />
    </ConfigProvider>
  );
};

export default AssistantPage;
