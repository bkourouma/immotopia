import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, DatePicker, InputNumber, Modal, Radio, Select, Space, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { printReceipts } from '../../services/syndic-receipt-service';
import { describeDownloadError, logDownloadError, readDownloadErrorBody } from '../../utils/download-error';
import { saveBlob } from '../../utils/save-blob';
import { ReceiptKind, SyndicateLot } from '../../types/syndic-types';
import { formatLotLabel } from '../../utils/syndic-lot-label';
import { t } from '../../i18n/t';

const { RangePicker } = DatePicker;
const { Text } = Typography;

/** Bornes de la grille A4 (lot S3) — mêmes valeurs que `GRID_LIMITS` côté API. */
const GRID_LIMITS = { minCols: 1, maxCols: 3, minRows: 1, maxRows: 4 } as const;

type PrintKind = ReceiptKind | 'ALL';

const kindOptions: Array<{ label: string; value: PrintKind }> = [
  { label: t('Quittances'), value: 'QUITTANCE' },
  { label: t('Reçus'), value: 'RECEIPT' },
  { label: t('Tous'), value: 'ALL' }
];

type Scope = 'ALL' | 'LOT';

export interface PrintReceiptsModalProps {
  open: boolean;
  tenantId: string;
  syndicId: string;
  lots: SyndicateLot[];
  onClose: () => void;
}

/** Petit schéma A4 qui matérialise la grille colonnes × lignes choisie. */
const GridPreview: React.FC<{ cols: number; rows: number }> = ({ cols, rows }) => (
  <div
    role="img"
    aria-label={t('Aperçu de la grille : {{cols}} colonne(s) sur {{rows}} ligne(s)', { cols, rows })}
    style={{
      width: 90,
      height: 127,
      border: '1px solid var(--border-color, #999)',
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gap: 2,
      padding: 2,
      background: 'var(--bg-secondary, #fafafa)'
    }}
  >
    {Array.from({ length: cols * rows }).map((_, index) => (
      <div key={index} style={{ border: '1px dashed var(--border-color, #ccc)' }} />
    ))}
  </div>
);

/**
 * Écran « Imprimer les quittances » (lot S3, besoin 1 — P7). Période
 * obligatoire, type, portée (toute la copropriété ou un lot) et grille A4
 * (1 à 3 colonnes × 1 à 4 lignes), avec un aperçu du PDF avant téléchargement.
 * L'URL d'objet de l'aperçu est révoquée à la fermeture ou au changement de
 * paramètres, pour ne pas fuir de mémoire.
 */
export const PrintReceiptsModal: React.FC<PrintReceiptsModalProps> = ({ open, tenantId, syndicId, lots, onClose }) => {
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [kind, setKind] = useState<PrintKind>('QUITTANCE');
  const [scope, setScope] = useState<Scope>('ALL');
  const [lotId, setLotId] = useState<string | undefined>(undefined);
  const [cols, setCols] = useState(2);
  const [rows, setRows] = useState(2);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'download' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setRange(null);
      setKind('QUITTANCE');
      setScope('ALL');
      setLotId(undefined);
      setCols(2);
      setRows(2);
      setError(null);
    }
  }, [open]);

  // Révoque l'URL d'objet de l'aperçu précédent à chaque changement ou fermeture.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const lotOptions = useMemo(() => lots.map(lot => ({ value: lot.id, label: formatLotLabel(lot) })), [lots]);

  const canSubmit = Boolean(range && (scope === 'ALL' || lotId));

  const buildQuery = () => {
    if (!range) return null;
    return {
      from: range[0].format('YYYY-MM-DD'),
      to: range[1].format('YYYY-MM-DD'),
      kind,
      lotId: scope === 'LOT' ? lotId : undefined,
      cols,
      rows
    };
  };

  const clearPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  /**
   * Message clair par site d'erreur : limites de débit (429), impression déjà
   * en cours (429), trop de pages (422, champ `pages`), en plus des 422
   * « aucun document » / « 500 documents au plus » déjà couverts par le
   * message générique de l'API — puis, faute de réponse exploitable (délai
   * dépassé, réseau coupé...), le classement générique de
   * `describeDownloadError`.
   *
   * `err.response.data` arrive en `Blob` (la requête demande
   * `responseType: 'blob'`), jamais en JSON déjà parsé : lire directement
   * `err.response.data.code` ne trouvait donc jamais rien.
   */
  const messageForError = async (err: unknown, fallback: string): Promise<string> => {
    logDownloadError(err);
    const status = (err as { response?: { status?: number } })?.response?.status;
    const body = await readDownloadErrorBody(err);
    if (status === 429 && body?.code === 'RATE_LIMITED') {
      return t("Trop d'impressions, réessayez dans une minute.");
    }
    if (status === 429 && body?.code === 'PRINT_IN_PROGRESS') {
      return t('Une impression est déjà en cours.');
    }
    if (status === 422 && body?.errors?.some(item => item.field === 'pages')) {
      return t('Trop de pages : réduisez la période ou augmentez le nombre de quittances par feuille.');
    }
    if (body?.message || body?.error) return (body.message || body.error) as string;
    // Une réponse est arrivée (422 générique...) mais sans message exploitable.
    if (status) return fallback;
    // Aucune réponse : délai dépassé, réseau coupé — message générique, déjà journalisé ci-dessus.
    return describeDownloadError(err);
  };

  const handlePreview = async () => {
    const query = buildQuery();
    if (!query) return;
    setBusy('preview');
    setError(null);
    clearPreview();
    try {
      const { blob } = await printReceipts(tenantId, syndicId, query);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(await messageForError(err, t('Aucun document ne correspond à cette période et à ces filtres.')));
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    const query = buildQuery();
    if (!query) return;
    setBusy('download');
    setError(null);
    try {
      const { blob, filename } = await printReceipts(tenantId, syndicId, query);
      saveBlob(blob, filename);
    } catch (err) {
      setError(await messageForError(err, t("Le téléchargement de l'impression groupée a échoué.")));
    } finally {
      setBusy(null);
    }
  };

  const applyShortcut = (from: Dayjs, to: Dayjs) => setRange([from, to]);

  /** Bornes du trimestre en cours (pas de plugin `quarterOfYear` dans ce paquet). */
  const currentQuarterRange = (): [Dayjs, Dayjs] => {
    const now = dayjs();
    const quarterStartMonth = Math.floor(now.month() / 3) * 3;
    const from = now.month(quarterStartMonth).startOf('month');
    const to = from.add(2, 'month').endOf('month');
    return [from, to];
  };

  return (
    <Modal
      title={t('Imprimer les quittances')}
      open={open}
      onCancel={() => {
        clearPreview();
        onClose();
      }}
      footer={null}
      width={760}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {error ? <Alert type="error" message={error} showIcon /> : null}

        <div>
          <Text strong>{t('Période')}</Text>
          <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <RangePicker
              aria-label={t('Période')}
              format="DD/MM/YYYY"
              value={range}
              onChange={value => setRange(value && value[0] && value[1] ? [value[0], value[1]] : null)}
            />
            <Button onClick={() => applyShortcut(dayjs().startOf('month'), dayjs().endOf('month'))}>
              {t('Mois en cours')}
            </Button>
            <Button onClick={() => applyShortcut(...currentQuarterRange())}>{t('Trimestre en cours')}</Button>
            <Button onClick={() => applyShortcut(dayjs().startOf('year'), dayjs().endOf('year'))}>
              {t('Année en cours')}
            </Button>
          </div>
        </div>

        <div>
          <Text strong>{t('Type de document')}</Text>
          <div style={{ marginTop: 4 }}>
            <Radio.Group
              options={kindOptions}
              optionType="button"
              value={kind}
              onChange={event => setKind(event.target.value)}
            />
          </div>
        </div>

        <div>
          <Text strong>{t('Portée')}</Text>
          <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Radio.Group value={scope} onChange={event => setScope(event.target.value)}>
              <Radio value="ALL">{t('Tous les copropriétaires')}</Radio>
              <Radio value="LOT">{t('Un copropriétaire ou un lot')}</Radio>
            </Radio.Group>
            {scope === 'LOT' ? (
              <Select
                showSearch
                optionFilterProp="label"
                style={{ minWidth: 220 }}
                placeholder={t('Choisir un lot')}
                options={lotOptions}
                value={lotId}
                onChange={value => setLotId(value)}
              />
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <Space direction="vertical" size={8}>
            <Text strong>{t('Mise en page A4')}</Text>
            <Space size={16}>
              <label>
                <Text style={{ marginInlineEnd: 8 }}>{t('Colonnes')}</Text>
                <InputNumber
                  aria-label={t('Colonnes')}
                  min={GRID_LIMITS.minCols}
                  max={GRID_LIMITS.maxCols}
                  value={cols}
                  onChange={value => setCols(typeof value === 'number' ? value : GRID_LIMITS.minCols)}
                />
              </label>
              <label>
                <Text style={{ marginInlineEnd: 8 }}>{t('Lignes')}</Text>
                <InputNumber
                  aria-label={t('Lignes')}
                  min={GRID_LIMITS.minRows}
                  max={GRID_LIMITS.maxRows}
                  value={rows}
                  onChange={value => setRows(typeof value === 'number' ? value : GRID_LIMITS.minRows)}
                />
              </label>
            </Space>
          </Space>
          <GridPreview cols={cols} rows={rows} />
        </div>

        <Space wrap>
          <Button onClick={() => void handlePreview()} disabled={!canSubmit} loading={busy === 'preview'}>
            {t('Aperçu')}
          </Button>
          <Button
            type="primary"
            onClick={() => void handleDownload()}
            disabled={!canSubmit}
            loading={busy === 'download'}
          >
            {t('Télécharger')}
          </Button>
        </Space>

        {previewUrl ? (
          <iframe
            title={t('Aperçu des quittances')}
            src={previewUrl}
            sandbox="allow-same-origin"
            style={{ width: '100%', height: 420, border: '1px solid var(--border-color, #ccc)', borderRadius: 6 }}
          />
        ) : null}
      </Space>
    </Modal>
  );
};
