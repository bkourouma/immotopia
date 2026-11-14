import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCopilotStatus } from '../../hooks/useCopilotStatus';
import { t } from '../../i18n/t';
import { feedback } from '../../lib/feedback';
import { copilotService } from '../../services/copilot-service';
import type { CopilotArtifact } from '../../types/copilot';
import { formatArtifactAmount, sanitizeArtifact } from '../../utils/copilot-artifact';

export default function PinnedAnalyses({ tenantId }: { tenantId: string }) {
  const { user } = useAuth();
  const status = useCopilotStatus(tenantId, Boolean(user));
  const [tiles, setTiles] = useState<Array<{ id: string; artifact: CopilotArtifact }>>([]);
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
      const pins = await copilotService.listAnalysisPins(tenantId, signal);
      for (let start = 0; start < pins.length && !signal.aborted; start += 3) {
        const batch = await Promise.allSettled(
          pins.slice(start, start + 3).map(async ({ id }) => {
            const artifact = sanitizeArtifact(await copilotService.getSharedAnalysis(tenantId, id, signal));
            return artifact ? { id, artifact } : undefined;
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
        {tiles.map(({ id, artifact }) => (
          <Col key={id} xs={24} md={12} xl={8}>
            <Card
              title={artifact.title}
              actions={[
                <Link
                  key="open"
                  to={`/tenant/${encodeURIComponent(tenantId)}/assistant?partage=${encodeURIComponent(id)}`}
                >
                  {t('Ouvrir')}
                </Link>,
                <Button
                  key="remove"
                  type="link"
                  onClick={async () => {
                    try {
                      await copilotService.setAnalysisPin(tenantId, id, false);
                      setTiles(previous => previous.filter(item => item.id !== id));
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
