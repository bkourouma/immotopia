import React, { Suspense, useRef, useState } from 'react';
import { CloseOutlined, DownloadOutlined } from '@ant-design/icons';
import { Button, Dropdown, Select, Skeleton, Typography } from 'antd';
import { feedback } from '../../../lib/feedback';
import { t } from '../../../i18n/t';
import type { CopilotArtifact } from '../../../types/copilot';
import { downloadChartPng, downloadCsv, downloadMarkdown, downloadXlsx } from '../../../utils/copilot-artifact-export';
import { SafeMarkdown } from '../SafeMarkdown';
import { ArtifactTable } from './ArtifactTable';

// recharts reste hors du bundle de la page : chargé à l'affichage d'un graphique.
const ArtifactChart = React.lazy(() => import('./ArtifactChart'));

export interface ArtifactPanelProps {
  artifacts: CopilotArtifact[];
  selectedId?: string;
  onSelect(id: string): void;
  onClose(): void;
}

function ArtifactBody({ artifact }: { artifact: CopilotArtifact }): React.ReactElement {
  switch (artifact.kind) {
    case 'table':
      return <ArtifactTable artifact={artifact} />;
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
export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ artifacts, selectedId, onSelect, onClose }) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
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

  const downloads =
    artifact.kind === 'table'
      ? [
          { key: 'csv', label: t('CSV'), onClick: () => run(() => downloadCsv(artifact)) },
          { key: 'xlsx', label: t('Excel (.xlsx)'), onClick: () => run(() => downloadXlsx(artifact)) }
        ]
      : artifact.kind === 'chart'
        ? [
            {
              key: 'png',
              label: t('Image (.png)'),
              onClick: () => run(() => downloadChartPng(bodyRef.current, artifact.title))
            },
            { key: 'csv', label: t('Données (.csv)'), onClick: () => run(() => downloadCsv(artifact)) }
          ]
        : [];

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
        {artifact.kind === 'markdown' ? (
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
      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <ArtifactBody artifact={artifact} />
      </div>
    </div>
  );
};

export default ArtifactPanel;
