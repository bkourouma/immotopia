import React, { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Empty, Popconfirm, Segmented, Spin } from 'antd';
import { t } from '../../i18n/t';
import { feedback } from '../../lib/feedback';
import { copilotService, type AnalysisShare } from '../../services/copilot-service';
import type { CopilotArtifact } from '../../types/copilot';
import { sanitizeArtifact } from '../../utils/copilot-artifact';
import { filenameFromDisposition, saveBlob } from '../../utils/save-blob';
import { ArtifactPanel } from './artifact/ArtifactPanel';

export function AnalysisShares({ tenantId, onClose }: { tenantId: string; onClose(): void }) {
  const [direction, setDirection] = useState<'incoming' | 'outgoing'>('incoming');
  const [items, setItems] = useState<AnalysisShare[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selection, setSelection] = useState<string>();
  const [artifact, setArtifact] = useState<CopilotArtifact>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void copilotService
      .listAnalysisShares(tenantId, direction, cursor)
      .then(page => {
        if (!active) return;
        setItems(previous => (cursor ? [...previous, ...page.items] : page.items));
        setNext(page.nextCursor);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tenantId, direction, cursor, revision]);

  useEffect(() => {
    if (!selection) return;
    let active = true;
    void copilotService
      .getSharedAnalysis(tenantId, selection)
      .then(payload => {
        const result = sanitizeArtifact(payload);
        if (!result) throw new Error();
        if (active) setArtifact(result);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [tenantId, selection]);

  async function revoke(id: string) {
    try {
      await copilotService.revokeAnalysisShare(tenantId, id);
      setItems(previous => previous.filter(item => item.id !== id));
      setCursor(undefined);
      setNext(undefined);
      setRevision(value => value + 1);
    } catch {
      feedback.error(t('Impossible de révoquer le partage.'));
    }
  }

  return (
    <Drawer open title={t('Partages')} size="min(780px, 100vw)" onClose={onClose}>
      {selection ? (
        <>
          <Button onClick={() => setSelection(undefined)}>{t('Retour aux partages')}</Button>
          {artifact ? (
            <ArtifactPanel
              serverDownloadsOnly
              artifacts={[artifact]}
              onSelect={() => undefined}
              onClose={() => setSelection(undefined)}
              onDownloadFile={async (_id, format) => {
                const result = await copilotService.downloadSharedAnalysis(tenantId, selection, format);
                saveBlob(
                  result.data,
                  filenameFromDisposition(result.headers['content-disposition'], `ImmoTopia.${format}`)
                );
              }}
            />
          ) : unavailable ? (
            <Alert type="error" message={t('Cette analyse partagée est indisponible.')} />
          ) : (
            <Spin />
          )}
        </>
      ) : (
        <>
          <Segmented<'incoming' | 'outgoing'>
            value={direction}
            onChange={value => {
              setItems([]);
              setCursor(undefined);
              setNext(undefined);
              setDirection(value);
            }}
            options={[
              { value: 'incoming', label: t('Reçus') },
              { value: 'outgoing', label: t('Envoyés') }
            ]}
          />
          {failed && <Alert type="error" message={t('Impossible de charger les partages.')} />}
          {loading && <Spin />}
          {!loading && !failed && !items.length && <Empty description={t('Aucun partage.')} />}
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {items.map(row => (
              <li key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBlock: 8 }}>
                <span>
                  {row.title && (
                    <>
                      <strong>{row.title}</strong> ·{' '}
                    </>
                  )}
                  {row.colleague || t('Collaborateur')} · {new Date(row.createdAt).toLocaleDateString()}
                </span>
                {direction === 'incoming' ? (
                  <Button
                    onClick={() => {
                      setArtifact(undefined);
                      setUnavailable(false);
                      setSelection(row.id);
                    }}
                  >
                    {t('Ouvrir')}
                  </Button>
                ) : (
                  <Popconfirm title={t('Révoquer ce partage ?')} onConfirm={() => revoke(row.id)}>
                    <Button danger>{t('Révoquer')}</Button>
                  </Popconfirm>
                )}
              </li>
            ))}
          </ul>
          {next && !failed && (
            <Button disabled={loading} onClick={() => setCursor(next)}>
              {t('Afficher plus')}
            </Button>
          )}
        </>
      )}
    </Drawer>
  );
}
