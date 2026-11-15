import React, { Suspense, useEffect, useRef, useState } from 'react';
import { CloseOutlined, DownloadOutlined } from '@ant-design/icons';
import { Button, Dropdown, Input, Modal, Select, Skeleton, Typography } from 'antd';
import { feedback } from '../../../lib/feedback';
import { useAssistantTranslation } from '../../../i18n/useAssistantTranslation';
import type { ArtifactVersionChange } from '../../../types/copilot';
import type {
  ArtifactDownloadFormat,
  ArtifactProvenance,
  ArtifactVersionInfo,
  CopilotArtifact
} from '../../../types/copilot';
import { downloadChartPng, downloadCsv, downloadMarkdown, downloadXlsx } from '../../../utils/copilot-artifact-export';
import { SafeMarkdown } from '../SafeMarkdown';
import { ArtifactTable } from './ArtifactTable';
import { formatArtifactAmount } from '../../../utils/copilot-artifact';

// recharts reste hors du bundle de la page : chargé à l'affichage d'un graphique.
const ArtifactChart = React.lazy(() => import('./ArtifactChart'));

export interface ArtifactPanelProps {
  artifacts: CopilotArtifact[];
  selectedId?: string;
  initialVersion?: number;
  onSelect(id: string): void;
  onClose(): void;
  serverDownloadsOnly?: boolean;
  onSaveAnalysis?(artifactId: string): Promise<void>;
  onFollowUp?(artifact: CopilotArtifact, version: number): void;
  onDownloadFile?(artifactId: string, format: ArtifactDownloadFormat, version?: number): Promise<void>;
  onReadVersion?(
    artifactId: string,
    version?: number
  ): Promise<{
    artifact: CopilotArtifact;
    version: number;
    latest: number;
    versions: ArtifactVersionInfo[];
  }>;
  onRefresh?(artifactId: string, expectedVersion?: number): Promise<void>;
  onRewriteSection?(
    artifactId: string,
    change: {
      expectedVersion: number;
      section: number;
      text: string;
      instruction: string;
    }
  ): Promise<string>;
  onEditVersion?(artifactId: string, change: ArtifactVersionChange): Promise<void>;
}

function ArtifactSource({ provenance }: { provenance: ArtifactProvenance }) {
  const { t, locale } = useAssistantTranslation();
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
      <time dateTime={provenance.calculatedAt}>{new Date(provenance.calculatedAt).toLocaleString(locale)}</time>
    </details>
  );
}

function ArtifactBody({ artifact }: { artifact: CopilotArtifact }): React.ReactElement {
  const { t, locale } = useAssistantTranslation();
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
                    {formatArtifactAmount(card.value, locale)}
                    {card.currency ? ' ' + card.currency : ''}
                  </bdi>
                </Typography.Text>
                {card.comparison && (
                  <div style={{ marginBlockStart: 4 }}>
                    {card.comparison.label && <span>{card.comparison.label} · </span>}
                    <bdi>
                      {formatArtifactAmount(card.comparison.value, locale)}
                      {card.currency ? ' ' + card.currency : ''}
                    </bdi>
                    {card.comparison.change !== undefined && (
                      <Typography.Text type="secondary" style={{ display: 'block' }}>
                        <bdi>
                          {new Intl.NumberFormat(locale, {
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
  initialVersion,
  onSelect,
  onClose,
  serverDownloadsOnly,
  onSaveAnalysis,
  onRefresh,
  onReadVersion,
  onFollowUp,
  onEditVersion,
  onRewriteSection,
  onDownloadFile
}) => {
  const { t, locale, language } = useAssistantTranslation();
  const exportLocale = { t, locale, rtl: language === 'ar' };
  const bodyRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const root = artifacts.find(a => a.id === selectedId) ?? artifacts[artifacts.length - 1];
  const rootId = root?.id;
  const [requested, setRequested] = useState<{ id: string; version: number } | undefined>(() =>
    rootId && initialVersion !== undefined ? { id: rootId, version: initialVersion } : undefined
  );
  const [loaded, setLoaded] = useState<Awaited<ReturnType<NonNullable<ArtifactPanelProps['onReadVersion']>>>>();
  const [revision, setRevision] = useState(0);
  const [failedVersion, setFailedVersion] = useState<typeof requested>();
  const [versionEdit, setVersionEdit] = useState<{ id: string } & ArtifactVersionChange>();
  const [rewriteInstruction, setRewriteInstruction] = useState('');
  const [rewriting, setRewriting] = useState(false);
  async function rewrite(section: number) {
    const edit = versionEdit;
    const text = edit?.textSections?.[section]?.trim();
    const instruction = rewriteInstruction.trim();
    if (!edit || !text || !instruction || rewriting || refreshing || !onRewriteSection) return;
    setRewriting(true);
    try {
      const proposal = await onRewriteSection(edit.id, {
        expectedVersion: edit.expectedVersion,
        section,
        text,
        instruction
      });
      setVersionEdit(current => {
        if (current !== edit || !current.textSections) return current;
        return {
          ...current,
          textSections: current.textSections.map((value, index) => (index === section ? proposal : value))
        };
      });
    } catch {
      feedback.error(t('La proposition de réécriture est indisponible.'));
    } finally {
      setRewriting(false);
    }
  }
  const viewed = requested?.id === rootId ? requested?.version : undefined;
  useEffect(() => {
    if (!rootId || !onReadVersion) return;
    let cancelled = false;
    setFailedVersion(undefined);
    // Keep the version list visible while loading another snapshot.
    void onReadVersion(rootId, viewed)
      .then(result => {
        if (!cancelled) setLoaded(result);
      })
      .catch(() => {
        if (!cancelled) {
          if (viewed !== undefined) setFailedVersion({ id: rootId, version: viewed });
          else feedback.error(t('Cette version est indisponible.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rootId, onReadVersion, viewed, revision]);
  if (!root) return null;
  const snapshot = onReadVersion && loaded?.artifact.id === root.id ? loaded : undefined;
  const artifact = snapshot?.artifact ?? root;
  const versionPending = Boolean(
    viewed !== undefined ? snapshot?.version !== viewed : snapshot && snapshot.version !== snapshot.latest
  );
  const versionFailed = failedVersion?.id === rootId && failedVersion?.version === viewed;
  const editableSections =
    artifact.kind === 'markdown'
      ? [artifact.content]
      : artifact.kind === 'document'
        ? artifact.blocks.flatMap(block => (block.kind === 'text' ? [block.content] : []))
        : [];
  const downloadVersion = snapshot && !versionPending ? snapshot.version : undefined;
  const downloadFile = (format: ArtifactDownloadFormat) =>
    downloadVersion ? onDownloadFile?.(artifact.id, format, downloadVersion) : onDownloadFile?.(artifact.id, format);

  const run = async (
    job: () => void | Promise<void>,
    errorMessage = t("Le téléchargement n'a pas pu être généré.")
  ) => {
    setBusy(true);
    try {
      await job();
    } catch {
      feedback.error(errorMessage);
    } finally {
      setBusy(false);
    }
  };

  async function refresh(id: string) {
    setRefreshing(true);
    try {
      if (snapshot) await onRefresh?.(id, snapshot.latest);
      else await onRefresh?.(id);
      setRequested(undefined);
      setRevision(value => value + 1);
    } catch {
      setRevision(value => value + 1);
      feedback.error(t('Cette analyse ne peut pas être recalculée.'));
    } finally {
      setRefreshing(false);
    }
  }

  async function saveVersion() {
    if (!versionEdit || !onEditVersion || versionEdit.id !== root?.id) return;
    const { id, ...change } = versionEdit;
    setRefreshing(true);
    try {
      await onEditVersion(id, change);
      setRequested(undefined);
      setVersionEdit(undefined);
    } catch {
      feedback.error(t('La modification du résultat a échoué.'));
    } finally {
      setRevision(value => value + 1);
      setRefreshing(false);
    }
  }

  const csv = () => run(() => (onDownloadFile ? downloadFile('csv') : downloadCsv(artifact, exportLocale)));
  const xlsx = () => run(() => (onDownloadFile ? downloadFile('xlsx') : downloadXlsx(artifact, exportLocale)));
  const downloadOptions =
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
        : [
            {
              key: 'md',
              label: t('Markdown (.md)'),
              onClick: () => run(() => downloadMarkdown(artifact, exportLocale))
            }
          ];
  const downloads = serverDownloadsOnly
    ? downloadOptions.filter(option => option.key !== 'png' && option.key !== 'md')
    : downloadOptions;
  if (serverDownloadsOnly && onDownloadFile && artifact.kind === 'document') {
    downloads.push({ key: 'xlsx', label: t('Excel (.xlsx)'), onClick: xlsx });
    if (artifact.blocks.length === 1 && artifact.blocks[0].kind === 'table') {
      downloads.push({ key: 'csv', label: t('CSV'), onClick: csv });
    }
  }
  if (onDownloadFile)
    downloads.push({
      key: 'pdf',
      label: t('PDF (.pdf)'),
      onClick: () => run(() => downloadFile('pdf'))
    });

  if (onDownloadFile)
    downloads.push({
      key: 'pptx',
      label: t('PowerPoint (.pptx)'),
      onClick: () => run(() => downloadFile('pptx'))
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
        {snapshot && snapshot.versions.length > 1 && (
          <Select
            aria-label={t('Version du résultat')}
            value={viewed ?? 0}
            onChange={version => setRequested(version === 0 ? undefined : { id: root.id, version })}
            options={[
              { value: 0, label: t('Dernière version') },
              ...snapshot.versions.map(item => ({
                value: item.version,
                label: t('Version {{version}}', { version: item.version })
              }))
            ]}
          />
        )}
        {onFollowUp && downloadVersion !== undefined && (
          <Button onClick={() => onFollowUp(artifact, downloadVersion)}>
            {t('Poser une question sur ce résultat')}
          </Button>
        )}
        {onEditVersion &&
          snapshot &&
          !versionPending &&
          downloadVersion === snapshot.latest &&
          editableSections.length > 0 && (
            <Button
              disabled={refreshing}
              onClick={() => {
                setRewriteInstruction('');
                setVersionEdit({ id: root.id, expectedVersion: snapshot.latest, textSections: editableSections });
              }}
            >
              {t('Modifier le texte')}
            </Button>
          )}
        {onEditVersion &&
          snapshot &&
          !versionPending &&
          (downloadVersion === snapshot.latest ? (
            <Button
              disabled={refreshing}
              onClick={() => setVersionEdit({ id: root.id, expectedVersion: snapshot.latest, title: artifact.title })}
            >
              {t('Renommer le résultat')}
            </Button>
          ) : (
            <Button
              disabled={refreshing}
              onClick={() =>
                setVersionEdit({ id: root.id, expectedVersion: snapshot.latest, restoreVersion: downloadVersion })
              }
            >
              {t('Restaurer cette version')}
            </Button>
          ))}
        {onRefresh && artifact.canRefresh && (!onReadVersion || (!!snapshot && !viewed)) && (
          <Button loading={refreshing} onClick={() => void refresh(artifact.id)}>
            {t('Recalculer')}
          </Button>
        )}
        {!onDownloadFile && (artifact.kind === 'markdown' || artifact.kind === 'document') ? (
          <Button
            icon={<DownloadOutlined aria-hidden />}
            onClick={() => void run(() => downloadMarkdown(artifact, exportLocale))}
          >
            {t('Télécharger')}
          </Button>
        ) : (
          <Dropdown menu={{ items: downloads }} trigger={['click']}>
            <Button
              icon={<DownloadOutlined aria-hidden />}
              loading={busy}
              disabled={versionPending || (!!onReadVersion && !snapshot)}
            >
              {t('Télécharger')}
            </Button>
          </Dropdown>
        )}
        {onSaveAnalysis && (
          <Button
            disabled={busy || versionPending || (!!onReadVersion && !snapshot)}
            onClick={() => void run(() => onSaveAnalysis(root.id), t('Impossible d’enregistrer cette analyse.'))}
          >
            {t('Enregistrer dans Mes analyses')}
          </Button>
        )}
        <Button
          type="text"
          icon={<CloseOutlined aria-hidden />}
          aria-label={t('Fermer le panneau')}
          onClick={onClose}
        />
      </header>
      <Modal
        open={versionEdit?.id === root.id}
        title={
          versionEdit?.textSections
            ? t('Modifier le texte')
            : versionEdit?.restoreVersion === undefined
              ? t('Renommer le résultat')
              : t('Restaurer cette version')
        }
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={refreshing}
        okButtonProps={{
          disabled: Boolean(
            rewriting ||
            versionEdit?.textSections?.some(text => !text.trim()) ||
            (versionEdit?.title !== undefined && !versionEdit.title.trim())
          )
        }}
        onCancel={() => {
          if (!refreshing && !rewriting) setVersionEdit(undefined);
        }}
        onOk={() => void saveVersion()}
      >
        {versionEdit?.textSections ? (
          <>
            {onRewriteSection && (
              <Input
                aria-label={t('Consigne de réécriture')}
                placeholder={t('Consigne de réécriture')}
                value={rewriteInstruction}
                disabled={rewriting}
                maxLength={1000}
                onChange={event => setRewriteInstruction(event.target.value)}
              />
            )}
            {versionEdit.textSections.map((text, index) => (
              <div key={index}>
                <Input.TextArea
                  disabled={rewriting}
                  aria-label={t('Section de texte {{number}}', { number: index + 1 })}
                  value={text}
                  maxLength={artifact.kind === 'markdown' ? 20_000 : 4000}
                  autoSize={{ minRows: 3, maxRows: 8 }}
                  style={{ marginBlockEnd: 8 }}
                  onChange={event => {
                    const textSections = [...(versionEdit.textSections ?? [])];
                    textSections[index] = event.target.value;
                    setVersionEdit({ ...versionEdit, textSections });
                  }}
                />
                {onRewriteSection && (
                  <Button
                    size="small"
                    onClick={() => void rewrite(index)}
                    disabled={rewriting || refreshing || !text.trim() || !rewriteInstruction.trim()}
                  >
                    {t('Réécrire la section {{number}}', { number: index + 1 })}
                  </Button>
                )}
              </div>
            ))}
          </>
        ) : versionEdit?.title !== undefined ? (
          <Input
            aria-label={t('Titre du résultat')}
            value={versionEdit.title}
            maxLength={120}
            onChange={event => setVersionEdit({ ...versionEdit, title: event.target.value })}
          />
        ) : (
          t('Cette restauration crée une nouvelle version et conserve l’historique.')
        )}
      </Modal>
      {!versionPending && 'provenance' in artifact && artifact.provenance && (
        <ArtifactSource provenance={artifact.provenance} />
      )}
      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {versionFailed ? (
          <Typography.Text type="danger" role="alert">
            {t('Cette version est indisponible.')}
          </Typography.Text>
        ) : versionPending ? (
          <Skeleton active aria-label={t('Chargement de la version')} />
        ) : (
          <ArtifactBody artifact={artifact} />
        )}
      </div>
    </div>
  );
};

export default ArtifactPanel;
