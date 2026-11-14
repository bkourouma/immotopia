import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Drawer, Empty, Popconfirm, Spin } from 'antd';
import { t } from '../../i18n/t';
import { feedback } from '../../lib/feedback';
import { copilotService, type SavedAnalysis, type SavedAnalysisReference } from '../../services/copilot-service';
import type { CopilotArtifact } from '../../types/copilot';
import { sanitizeArtifact } from '../../utils/copilot-artifact';
import { filenameFromDisposition, saveBlob } from '../../utils/save-blob';
import { ArtifactPanel } from './artifact/ArtifactPanel';
import { ShareAnalysisDialog } from './ShareAnalysisDialog';
import { ScheduleReportDialog } from './ScheduleReportDialog';

function SavedAnalysisPreview({
  tenantId,
  item,
  onBack
}: {
  tenantId: string;
  item: SavedAnalysisReference;
  onBack(): void;
}) {
  const [artifact, setArtifact] = useState<CopilotArtifact>();
  const [failed, setFailed] = useState(false);
  const read = useCallback(
    async (id: string, version?: number) => {
      const result = await copilotService.getArtifactVersion(tenantId, item.conversationId, id, version);
      const safe = sanitizeArtifact(result.artifact);
      if (!safe || safe.id !== id) throw new Error(t('Cette version est indisponible.'));
      return { ...result, artifact: safe };
    },
    [tenantId, item.conversationId]
  );
  useEffect(() => {
    let active = true;
    void read(item.artifactId)
      .then(result => {
        if (active) setArtifact(result.artifact);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [read, item.artifactId]);
  if (failed) return <Alert type="error" message={t('Cette version est indisponible.')} />;
  if (!artifact) return <Spin />;
  return (
    <ArtifactPanel
      artifacts={[artifact]}
      onSelect={() => undefined}
      onClose={onBack}
      onReadVersion={read}
      onRefresh={async (id, expectedVersion = 1) => {
        const result = await copilotService.updateArtifactVersion(tenantId, item.conversationId, id, {
          expectedVersion
        });
        const updated = sanitizeArtifact(result.artifact);
        if (!updated || updated.id !== id) throw new Error(t('Cette analyse ne peut pas être recalculée.'));
        setArtifact(updated);
      }}
      onDownloadFile={async (id, format, version) => {
        const file = await copilotService.downloadArtifact(tenantId, item.conversationId, id, format, version);
        saveBlob(file.data, filenameFromDisposition(file.headers['content-disposition'], `ImmoTopia.${format}`));
      }}
    />
  );
}

export function SavedAnalyses({
  tenantId,
  onClose,
  initialAnalysis,
  onReportCreated,
  onCreateTask
}: {
  tenantId: string;
  onClose(): void;
  initialAnalysis?: SavedAnalysisReference;
  onReportCreated(): void;
  onCreateTask(analysis: SavedAnalysis): void;
}) {
  const [items, setItems] = useState<SavedAnalysis[]>([]);
  const [selected, setSelected] = useState<SavedAnalysisReference | undefined>(initialAnalysis);
  const [cursor, setCursor] = useState<SavedAnalysisReference>();
  const [nextCursor, setNextCursor] = useState<SavedAnalysisReference>();
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [shareItem, setShareItem] = useState<SavedAnalysis>();
  const [report, setReport] = useState<{ item: SavedAnalysis; immediate: boolean }>();
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setFailed(false);
    void copilotService
      .listSavedAnalyses(tenantId, cursor, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setItems(previous => (cursor ? [...previous, ...result.items] : result.items));
        setNextCursor(result.nextCursor);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [tenantId, cursor, reload]);

  async function remove(item: SavedAnalysis) {
    try {
      await copilotService.removeSavedAnalysis(tenantId, item);
      setItems(previous => previous.filter(row => row !== item));
      setNextCursor(undefined);
      setCursor(undefined);
      setReload(value => value + 1);
    } catch {
      feedback.error(t('Impossible de retirer cette analyse.'));
    }
  }

  return (
    <Drawer
      title={t('Mes analyses')}
      open
      onClose={onClose}
      size="min(780px, 100vw)"
      extra={selected && <Button onClick={() => setSelected(undefined)}>{t('Retour aux analyses')}</Button>}
    >
      {shareItem && (
        <ShareAnalysisDialog tenantId={tenantId} reference={shareItem} onClose={() => setShareItem(undefined)} />
      )}
      {report && (
        <ScheduleReportDialog
          tenantId={tenantId}
          analysis={report.item}
          immediate={report.immediate}
          onClose={() => setReport(undefined)}
          onCreated={onReportCreated}
        />
      )}
      {selected ? (
        <SavedAnalysisPreview tenantId={tenantId} item={selected} onBack={() => setSelected(undefined)} />
      ) : (
        <div style={{ display: 'grid', gap: 12 }} aria-busy={busy}>
          {failed && (
            <Alert
              type="error"
              message={t('Impossible de charger les analyses.')}
              action={<Button onClick={() => setReload(value => value + 1)}>{t('Réessayer')}</Button>}
            />
          )}
          {busy && <Spin />}
          {!busy && !failed && items.length === 0 && <Empty description={t('Aucune analyse enregistrée.')} />}
          {items.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {items.map(item => (
                <li
                  key={`${item.conversationId}/${item.artifactId}`}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    paddingBlock: 8
                  }}
                >
                  <Button
                    type="link"
                    style={{ whiteSpace: 'normal', height: 'auto', textAlign: 'start' }}
                    onClick={() => setSelected(item)}
                  >
                    {item.title || t('Résultat')}
                  </Button>
                  <Button
                    type="text"
                    onClick={() => {
                      setShareItem(item);
                    }}
                  >
                    {t('Partager')}
                  </Button>
                  <Button
                    type="text"
                    onClick={async () => {
                      const pinned = !item.pinnedAt;
                      try {
                        await copilotService.setSavedAnalysisPin(tenantId, item, pinned);
                        setItems(previous =>
                          previous.map(row =>
                            row.conversationId === item.conversationId && row.artifactId === item.artifactId
                              ? { ...row, pinnedAt: pinned ? new Date().toISOString() : null }
                              : row
                          )
                        );
                      } catch {
                        feedback.error(t('Impossible de modifier l’épingle.'));
                      }
                    }}
                  >
                    {item.pinnedAt ? t('Désépingler') : t('Épingler au tableau de bord')}
                  </Button>
                  <Popconfirm
                    title={t('Retirer cette analyse de la liste ?')}
                    okText={t('Retirer')}
                    cancelText={t('Annuler')}
                    onConfirm={() => remove(item)}
                  >
                    <Button type="text" danger disabled={busy}>
                      {t('Retirer')}
                    </Button>
                  </Popconfirm>
                  <Button type="text" onClick={() => setReport({ item, immediate: false })}>
                    {t('Programmer un rapport')}
                  </Button>
                  <Button type="text" onClick={() => setReport({ item, immediate: true })}>
                    {t('Envoyer par e-mail')}
                  </Button>
                  <Button type="text" onClick={() => onCreateTask(item)}>
                    {t('Créer une tâche')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {nextCursor && !failed && (
            <Button onClick={() => setCursor(nextCursor)} disabled={busy}>
              {t('Afficher plus')}
            </Button>
          )}
        </div>
      )}
    </Drawer>
  );
}
