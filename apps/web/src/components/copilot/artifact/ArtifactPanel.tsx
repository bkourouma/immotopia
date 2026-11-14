import React, { Suspense, useRef, useState } from 'react';
import { CloseOutlined, DownloadOutlined } from '@ant-design/icons';
import { Button, Dropdown, Select, Skeleton, Typography } from 'antd';
import { feedback } from '../../../lib/feedback';
import { t } from '../../../i18n/t';
import type { ArtifactDownloadFormat, ArtifactProvenance, CopilotArtifact } from '../../../types/copilot';
import { downloadChartPng, downloadCsv, downloadMarkdown, downloadXlsx } from '../../../utils/copilot-artifact-export';
import { SafeMarkdown } from '../SafeMarkdown';
import { ArtifactTable } from './ArtifactTable';
import { formatArtifactAmount } from '../../../utils/copilot-artifact';
import { activeLocale } from '../../../i18n/format';

// recharts reste hors du bundle de la page : chargé à l'affichage d'un graphique.
const ArtifactChart = React.lazy(() => import('./ArtifactChart'));

export interface ArtifactPanelProps {
  artifacts: CopilotArtifact[];
  selectedId?: string;
  onSelect(id: string): void;
  onClose(): void;
  onDownloadFile?(artifactId: string, format: ArtifactDownloadFormat): Promise<void>;
  onRefresh?(artifactId: string): Promise<void>;
}

function ArtifactSource({ provenance }: { provenance: ArtifactProvenance }) {
  return (
    <details style={{ marginBlock: 8 }}>
      <summary>{t('Comment j’ai calculé')}</summary>
      <p>
        <a href={provenance.href}>{provenance.source}</a> · {provenance.period}
      </p>
      <ul>
        {provenance.rules.map((rule, index) => (
          <li key={index}>{rule}</li>
        ))}
      </ul>
      <time dateTime={provenance.calculatedAt}>{new Date(provenance.calculatedAt).toLocaleString(activeLocale())}</time>
    </details>
  );
}

function ArtifactBody({ artifact }: { artifact: CopilotArtifact }): React.ReactElement {
  switch (artifact.kind) {
    case 'document':
      return (
        <article aria-label={artifact.title}>
          {artifact.blocks.map((block, index) =>
            block.kind === 'text' ? (
              <SafeMarkdown key={index} text={block.content} />
            ) : (
              <section key={index} aria-label={block.table.title} style={{ marginBlock: 16 }}>
                <Typography.Title level={5}>{block.table.title}</Typography.Title>
                {block.table.provenance && <ArtifactSource provenance={block.table.provenance} />}
                <ArtifactTable artifact={block.table} />
              </section>
            )
          )}
        </article>
      );
    case 'table':
      return <ArtifactTable artifact={artifact} />;
    case 'indicators':
      return (
        <dl
          style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}
        >
          {artifact.cards.map((card, index) => (
            <div
              key={index}
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 12,
                minWidth: 0,
                overflowWrap: 'anywhere'
              }}
            >
              <dt>{card.label}</dt>
              <dd style={{ marginInlineStart: 0 }}>
                <Typography.Text strong style={{ fontSize: '1.35rem' }}>
                  <bdi>
                    {formatArtifactAmount(card.value)}
                    {card.currency ? ' ' + card.currency : ''}
                  </bdi>
                </Typography.Text>
                {card.comparison && (
                  <div style={{ marginBlockStart: 4 }}>
                    {card.comparison.label && <span>{card.comparison.label} · </span>}
                    <bdi>
                      {formatArtifactAmount(card.comparison.value)}
                      {card.currency ? ' ' + card.currency : ''}
                    </bdi>
                    {card.comparison.change !== undefined && (
                      <Typography.Text type="secondary" style={{ display: 'block' }}>
                        <bdi>
                          {new Intl.NumberFormat(activeLocale(), {
                            style: 'percent',
                            signDisplay: 'exceptZero',
                            maximumFractionDigits: 2
                          }).format(card.comparison.change / 100)}
                        </bdi>
                      </Typography.Text>
                    )}
                  </div>
                )}
              </dd>
            </div>
          ))}
        </dl>
      );
    case 'markdown':
      return <SafeMarkdown text={artifact.content} />;
    case 'chart':
      return (
        <Suspense fallback={<Skeleton active aria-label={t("Chargement de l'écran")} />}>
          <ArtifactChart artifact={artifact} />
        </Suspense>
      );
  }
}

/** Panneau de résultats : sélecteur d'artefact, téléchargement, fermeture, rendu. */
export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({
  artifacts,
  selectedId,
  onSelect,
  onClose,
  onRefresh,
  onDownloadFile
}) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const artifact = artifacts.find(a => a.id === selectedId) ?? artifacts[artifacts.length - 1];
  if (!artifact) return null;

  const run = async (job: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await job();
    } catch {
      feedback.error(t("Le téléchargement n'a pas pu être généré."));
    } finally {
      setBusy(false);
    }
  };

  async function refresh(id: string) {
    setRefreshing(true);
    try {
      await onRefresh?.(id);
    } catch {
      feedback.error(t('Cette analyse ne peut pas être recalculée.'));
    } finally {
      setRefreshing(false);
    }
  }

  const csv = () => run(() => (onDownloadFile ? onDownloadFile(artifact.id, 'csv') : downloadCsv(artifact)));
  const xlsx = () => run(() => (onDownloadFile ? onDownloadFile(artifact.id, 'xlsx') : downloadXlsx(artifact)));
  const downloads =
    artifact.kind === 'table' || artifact.kind === 'indicators'
      ? [
          { key: 'csv', label: t('CSV'), onClick: csv },
          { key: 'xlsx', label: t('Excel (.xlsx)'), onClick: xlsx }
        ]
      : artifact.kind === 'chart'
        ? [
            {
              key: 'png',
              label: t('Image (.png)'),
              onClick: () => run(() => downloadChartPng(bodyRef.current, artifact.title))
            },
            { key: 'csv', label: t('Données (.csv)'), onClick: csv },
            { key: 'xlsx', label: t('Excel (.xlsx)'), onClick: xlsx }
          ]
        : [{ key: 'md', label: t('Markdown (.md)'), onClick: () => run(() => downloadMarkdown(artifact)) }];
  if (onDownloadFile)
    downloads.push({
      key: 'pdf',
      label: t('PDF (.pdf)'),
      onClick: () => run(() => onDownloadFile(artifact.id, 'pdf'))
    });

  if (onDownloadFile)
    downloads.push({
      key: 'pptx',
      label: t('PowerPoint (.pptx)'),
      onClick: () => run(() => onDownloadFile(artifact.id, 'pptx'))
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <header
        style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBlockEnd: 'var(--space-2)', flexWrap: 'wrap' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {artifacts.length > 1 ? (
            <Select
              aria-label={t('Résultat affiché')}
              value={artifact.id}
              onChange={onSelect}
              style={{ width: '100%' }}
              options={artifacts.map(a => ({ value: a.id, label: a.title || t('Résultat') }))}
            />
          ) : (
            <Typography.Title level={5} style={{ margin: 0, overflowWrap: 'anywhere' }}>
              {artifact.title || t('Résultat')}
            </Typography.Title>
          )}
        </div>
        {onRefresh && artifact.canRefresh && (
          <Button loading={refreshing} onClick={() => void refresh(artifact.id)}>
            {t('Recalculer')}
          </Button>
        )}
        {!onDownloadFile && (artifact.kind === 'markdown' || artifact.kind === 'document') ? (
          <Button icon={<DownloadOutlined aria-hidden />} onClick={() => void run(() => downloadMarkdown(artifact))}>
            {t('Télécharger')}
          </Button>
        ) : (
          <Dropdown menu={{ items: downloads }} trigger={['click']}>
            <Button icon={<DownloadOutlined aria-hidden />} loading={busy}>
              {t('Télécharger')}
            </Button>
          </Dropdown>
        )}
        <Button
          type="text"
          icon={<CloseOutlined aria-hidden />}
          aria-label={t('Fermer le panneau')}
          onClick={onClose}
        />
      </header>
      {'provenance' in artifact && artifact.provenance && <ArtifactSource provenance={artifact.provenance} />}
      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <ArtifactBody artifact={artifact} />
      </div>
    </div>
  );
};

export default ArtifactPanel;
