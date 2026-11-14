import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Drawer, Empty, Modal, Popconfirm, Select, Spin } from 'antd';
import { t } from '../../i18n/t';
import { feedback } from '../../lib/feedback';
import { copilotService, type SavedAnalysis, type SavedAnalysisReference } from '../../services/copilot-service';
import type { CopilotArtifact } from '../../types/copilot';
import { sanitizeArtifact } from '../../utils/copilot-artifact';
import { filenameFromDisposition, saveBlob } from '../../utils/save-blob';
import { ArtifactPanel } from './artifact/ArtifactPanel';

function SavedAnalysisPreview({ tenantId, item, onBack }: { tenantId: string; item: SavedAnalysis; onBack(): void }) {
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

export function SavedAnalyses({ tenantId, onClose }: { tenantId: string; onClose(): void }) {
  const [items, setItems] = useState<SavedAnalysis[]>([]);
  const [selected, setSelected] = useState<SavedAnalysis>();
  const [cursor, setCursor] = useState<SavedAnalysisReference>();
  const [nextCursor, setNextCursor] = useState<SavedAnalysisReference>();
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [shareItem, setShareItem] = useState<SavedAnalysis>();
  const [recipient, setRecipient] = useState<string>();
  const [sharing, setSharing] = useState(false);
  const [recipients, setRecipients] = useState<Array<{ userId: string; displayName: string }>>([]);
  useEffect(() => {
    if (!shareItem) return;
    let active = true;
    void copilotService
      .listAnalysisRecipients(tenantId)
      .then(items => {
        if (active) setRecipients(items);
      })
      .catch(() => {
        if (active) feedback.error(t('Impossible de charger les destinataires.'));
      });
    return () => {
      active = false;
    };
  }, [shareItem, tenantId]);

  async function share() {
    if (!shareItem || !recipient || sharing) return;
    setSharing(true);
    try {
      await copilotService.shareAnalysis(tenantId, shareItem, recipient);
      setShareItem(undefined);
      feedback.success(t('Analyse partagée.'));
    } catch {
      feedback.error(t('Le partage exige des données recalculables et un destinataire habilité.'));
    } finally {
      setSharing(false);
    }
  }
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
      <Modal
        open={!!shareItem}
        title={t('Partager une analyse')}
        okText={t('Partager')}
        cancelText={t('Annuler')}
        onCancel={() => {
          if (!sharing) setShareItem(undefined);
        }}
        onOk={() => void share()}
        confirmLoading={sharing}
        okButtonProps={{ disabled: !recipient }}
      >
        <p>{t('Le collègue voit les résultats recalculés selon vos droits communs.')}</p>
        <Select
          aria-label={t('Destinataire')}
          placeholder={t('Destinataire')}
          value={recipient}
          onChange={setRecipient}
          options={recipients.map(item => ({ value: item.userId, label: item.displayName }))}
          style={{ width: '100%' }}
        />
      </Modal>
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
                      setRecipient(undefined);
                      setRecipients([]);
                      setShareItem(item);
                    }}
                  >
                    {t('Partager')}
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
