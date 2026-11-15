import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCopilotStatus } from '../../hooks/useCopilotStatus';
import { t } from '../../i18n/t';
import { feedback } from '../../lib/feedback';
import { copilotService, type SavedAnalysisReference } from '../../services/copilot-service';
import type { CopilotArtifact } from '../../types/copilot';
import { formatArtifactAmount, sanitizeArtifact } from '../../utils/copilot-artifact';

type PinReference = { id: string } | SavedAnalysisReference;
type Tile = { key: string; reference: PinReference; artifact: CopilotArtifact };

export default function PinnedAnalyses({ tenantId }: { tenantId: string }) {
  const { user } = useAuth();
  const status = useCopilotStatus(tenantId, Boolean(user));
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [revision, setRevision] = useState(0);
  const enabled = status?.enabled === true;
  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => {
      setTiles([]);
      setRevision(value => value + 1);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const { signal } = controller;
    async function load() {
      const lists = await Promise.allSettled([
        copilotService.listAnalysisPins(tenantId, signal),
        copilotService.listSavedAnalysisPins(tenantId, signal)
      ]);
      const pins: PinReference[] = lists.flatMap<PinReference>(list => (list.status === 'fulfilled' ? list.value : []));
      for (let start = 0; start < pins.length && !signal.aborted; start += 3) {
        const batch = await Promise.allSettled(
          pins.slice(start, start + 3).map(async reference => {
            const payload =
              'id' in reference
                ? await copilotService.getSharedAnalysis(tenantId, reference.id, signal)
                : await copilotService.getSavedAnalysisPin(tenantId, reference, signal);
            const artifact = sanitizeArtifact(payload);
            const key = 'id' in reference ? reference.id : `${reference.conversationId}/${reference.artifactId}`;
            return artifact ? { key, reference, artifact } : undefined;
          })
        );
        if (signal.aborted) return;
        setTiles(previous => [
          ...previous,
          ...batch.flatMap(item => (item.status === 'fulfilled' && item.value ? [item.value] : []))
        ]);
      }
    }
    setTiles([]);
    void load().catch(() => undefined);
    return () => controller.abort();
  }, [enabled, tenantId, user?.id, revision]);

  if (!enabled || !tiles.length) return null;
  return (
    <section aria-label={t('Analyses épinglées')} style={{ marginBlock: 'var(--space-4)' }}>
      <Typography.Title level={3}>{t('Analyses épinglées')}</Typography.Title>
      <Row gutter={[16, 16]}>
        {tiles.map(({ key, reference, artifact }) => (
          <Col key={key} xs={24} md={12} xl={8}>
            <Card
              title={artifact.title}
              actions={[
                <Link
                  key="open"
                  to={`/tenant/${encodeURIComponent(tenantId)}/assistant?${new URLSearchParams(
                    'id' in reference
                      ? { partage: reference.id }
                      : { fil: reference.conversationId, analyse: reference.artifactId }
                  )}`}
                >
                  {t('Ouvrir')}
                </Link>,
                <Button
                  key="remove"
                  type="link"
                  onClick={async () => {
                    try {
                      if ('id' in reference) await copilotService.setAnalysisPin(tenantId, reference.id, false);
                      else await copilotService.setSavedAnalysisPin(tenantId, reference, false);
                      setTiles(previous => previous.filter(item => item.key !== key));
                    } catch {
                      feedback.error(t('Impossible de modifier l’épingle.'));
                    }
                  }}
                >
                  {t('Désépingler')}
                </Button>
              ]}
            >
              {artifact.kind !== 'document' && 'provenance' in artifact && artifact.provenance && (
                <Typography.Text>
                  {artifact.provenance.source} · {artifact.provenance.period}
                </Typography.Text>
              )}
              {artifact.kind === 'indicators' && artifact.cards[0] && (
                <div>
                  <Typography.Text strong>{artifact.cards[0].label}</Typography.Text>{' '}
                  {formatArtifactAmount(artifact.cards[0].value)} {artifact.cards[0].currency}
                </div>
              )}
            </Card>
          </Col>
        ))}
      </Row>
    </section>
  );
}
