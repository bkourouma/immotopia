import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Alert, Button, Card, Descriptions, Result, Space, Spin, Typography } from 'antd';
import {
  downloadPublicExternalAccessDocument,
  fetchPublicExternalAccessView
} from '../../services/external-access-service';
import type { ExternalAccessViewDto } from '../../types/external-access';
import { accessTypeLabel } from '../patrimoine/external-access/external-access-labels';
import { t } from '../../i18n/t';
import { Money, formatDate } from './external-access-view/blocks';
import { PropertiesSection } from './external-access-view/PropertiesSection';

const { Title, Text } = Typography;

type ViewState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'rate_limited' }
  | { kind: 'unavailable' }
  | { kind: 'ok'; view: ExternalAccessViewDto };

/**
 * Lit le jeton dans le fragment de l'adresse (`#<jeton>`), puis retire aussitôt
 * le fragment de la barre d'adresse : il ne reste ni dans l'historique ni dans
 * une capture d'écran. Retourne `null` si aucun jeton.
 */
function consumeTokenFromHash(): string | null {
  const token = window.location.hash.replace(/^#/, '').trim();
  try {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  } catch {
    // Sans importance : le jeton est déjà lu.
  }
  return token || null;
}

/** Ajoute des balises <meta> le temps que la page est montée ; retourne le nettoyage. */
function installMeta(entries: Array<{ name: string; content: string }>): () => void {
  const created = entries.map(({ name, content }) => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', name);
    meta.setAttribute('content', content);
    document.head.appendChild(meta);
    return meta;
  });
  return () => created.forEach(meta => meta.remove());
}

const PRINT_CSS = `
@media print {
  .external-access-no-print { display: none !important; }
  .external-access-page div:has(> button[aria-haspopup="menu"]) { display: none !important; }
  .external-access-page button[aria-haspopup="menu"] { display: none !important; }
  .external-access-page { padding: 0 !important; background: #fff !important; }
  .external-access-page .ant-card { box-shadow: none !important; border: 1px solid #ddd !important; break-inside: avoid; }
}
`;

const SummaryCard: React.FC<{ view: ExternalAccessViewDto }> = ({ view }) => {
  const { summary, currency } = view;
  return (
    <Card title={t('Synthèse')}>
      <Descriptions bordered column={{ xs: 1, sm: 2 }}>
        <Descriptions.Item label={t('Biens concernés')}>{summary.propertyCount}</Descriptions.Item>
        {summary.totalEstimatedValue !== undefined ? (
          <Descriptions.Item label={t('Valeur estimée totale')}>
            <Money value={summary.totalEstimatedValue} currency={currency} />
          </Descriptions.Item>
        ) : null}
        {summary.totalLatentCapitalGain !== undefined ? (
          <Descriptions.Item label={t('Plus-value latente totale')}>
            <Money value={summary.totalLatentCapitalGain} currency={currency} signed />
          </Descriptions.Item>
        ) : null}
        {summary.totalRemainingLoanCapital !== undefined ? (
          <Descriptions.Item label={t('Capital restant dû total')}>
            <Money value={summary.totalRemainingLoanCapital} currency={currency} />
          </Descriptions.Item>
        ) : null}
      </Descriptions>
      {summary.ownerShareApplied && view.ownerName ? (
        <Text type="secondary" style={{ display: 'block', marginBlockStart: 12 }}>
          {t('Totaux calculés selon la quote-part de {{owner}}', { owner: view.ownerName })}
        </Text>
      ) : null}
      {summary.truncated ? (
        <Text type="secondary" style={{ display: 'block', marginBlockStart: 8 }}>
          {t('Seuls les 100 premiers biens du périmètre sont affichés.')}
        </Text>
      ) : null}
    </Card>
  );
};

interface ViewProps {
  view: ExternalAccessViewDto;
  busyRef: string | null;
  downloadError: string | null;
  onDownload: (documentRef: string) => void;
  /** Impression en cours : tous les biens et toutes les rubriques, empilés. */
  printAll: boolean;
}

const AccessView: React.FC<ViewProps> = ({ view, busyRef, downloadError, onDownload, printAll }) => (
  <Space orientation="vertical" size="large" style={{ width: '100%' }}>
    <Alert
      type="info"
      showIcon
      title={t('Accès en lecture seule accordé par {{agency}}', { agency: view.agencyName })}
    />
    <div>
      <Text type="secondary">{accessTypeLabel(view.grantType)}</Text>
      <Title level={2} style={{ margin: 0 }}>
        {t('Patrimoine — {{name}}', { name: view.recipientName })}
      </Title>
      {view.ownerName ? (
        <Text>
          {t('Propriétaire')} : {view.ownerName}
        </Text>
      ) : null}
    </div>
    <SummaryCard view={view} />
    {downloadError ? <Alert type="error" showIcon title={downloadError} /> : null}
    <PropertiesSection
      properties={view.properties}
      currency={view.currency}
      busyRef={busyRef}
      onDownload={onDownload}
      printAll={printAll}
    />
    <Text type="secondary">
      {view.accessExpiresAt
        ? t('Cet accès expire le {{date}}.', { date: formatDate(view.accessExpiresAt) })
        : t('Cet accès est permanent ; ce lien expire le {{date}}.', { date: formatDate(view.linkExpiresAt) })}
    </Text>
  </Space>
);

/** Déclenche l'enregistrement d'un blob sous un nom donné (lien interne `blob:`, jamais sortant). */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Page publique d'un accès partagé à un tiers de confiance (spec 034, lecture
 * seule). Le jeton vient du fragment de l'adresse, est retiré de la barre
 * d'adresse, reste en mémoire et part dans le CORPS des POST (lecture et
 * téléchargement). Aucune saisie, aucun lien sortant. Les échecs de lien
 * (inconnu, expiré, révoqué) se confondent en un seul message.
 */
export const ExternalAccessViewPage: React.FC = () => {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // Impression : le temps de l'impression, la page rend TOUT (biens et rubriques empilés).
  const [printAll, setPrintAll] = useState(false);
  // Le jeton survit au double montage de React.StrictMode : le fragment n'est lu qu'une fois.
  const tokenRef = useRef<string | null | undefined>(undefined);
  // Une seule lecture par jeton : le second passage StrictMode réutilise la promesse
  // (sinon deux POST, donc deux consultations journalisées et comptées).
  const requestRef = useRef<{
    token: string;
    promise: ReturnType<typeof fetchPublicExternalAccessView>;
  } | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = t('Accès partagé');
    const removeMeta = installMeta([
      { name: 'robots', content: t('noindex, nofollow') },
      { name: 'referrer', content: 'no-referrer' }
    ]);
    return () => {
      document.title = previousTitle;
      removeMeta();
    };
  }, []);

  useEffect(() => {
    if (tokenRef.current === undefined) tokenRef.current = consumeTokenFromHash();
    const token = tokenRef.current;
    if (!token) {
      setState({ kind: 'invalid' });
      return undefined;
    }
    let cancelled = false;
    if (requestRef.current?.token !== token) {
      requestRef.current = { token, promise: fetchPublicExternalAccessView(token) };
    }
    void requestRef.current.promise.then(result => {
      if (cancelled) return;
      if (result.status === 'ok') setState({ kind: 'ok', view: result.view });
      else setState({ kind: result.status });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Impression : Ctrl+P (beforeprint) comme le bouton passent par le même rendu complet, rendu
  // de façon synchrone (flushSync) avant que le navigateur prenne son instantané ; afterprint
  // rend l'affichage d'avant (page, filtre et onglets sont tenus par des états qui survivent).
  const printAllRef = useRef(false);
  const enterPrintMode = useCallback(() => {
    if (printAllRef.current) return;
    printAllRef.current = true;
    flushSync(() => setPrintAll(true));
  }, []);
  const leavePrintMode = useCallback(() => {
    if (!printAllRef.current) return;
    printAllRef.current = false;
    setPrintAll(false);
  }, []);

  useEffect(() => {
    window.addEventListener('beforeprint', enterPrintMode);
    window.addEventListener('afterprint', leavePrintMode);
    // Safari n'émet pas toujours « afterprint » : la requête média « print » prévient aussi de la sortie.
    const mql = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;
    const onPrintMediaChange = (event: { matches: boolean }) => {
      if (event.matches) enterPrintMode();
      else leavePrintMode();
    };
    if (mql) {
      if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onPrintMediaChange);
      else if (typeof mql.addListener === 'function') mql.addListener(onPrintMediaChange);
    }
    return () => {
      window.removeEventListener('beforeprint', enterPrintMode);
      window.removeEventListener('afterprint', leavePrintMode);
      if (mql) {
        if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onPrintMediaChange);
        else if (typeof mql.removeListener === 'function') mql.removeListener(onPrintMediaChange);
      }
    };
  }, [enterPrintMode, leavePrintMode]);

  const handlePrint = () => {
    enterPrintMode();
    window.print();
    // Un navigateur sans l'événement « afterprint » ne préviendrait jamais : retour au mode normal.
    if (!('onafterprint' in window)) leavePrintMode();
  };

  const handleDownload = async (documentRef: string) => {
    const token = tokenRef.current;
    if (!token) return;
    setBusyRef(documentRef);
    setDownloadError(null);
    const result = await downloadPublicExternalAccessDocument(token, documentRef);
    setBusyRef(null);
    if (result.status === 'ok') saveBlob(result.blob, result.fileName ?? t('document'));
    else if (result.status === 'invalid') setDownloadError(t('Lien invalide ou expiré.'));
    else setDownloadError(t('Téléchargement impossible pour le moment, réessayez dans quelques minutes.'));
  };

  return (
    <div
      className="external-access-page"
      style={{ minHeight: '100vh', padding: '24px 16px', background: 'var(--color-bg-layout, #f5f5f5)' }}
    >
      <style>{PRINT_CSS}</style>
      <div style={{ maxWidth: 1040, marginInline: 'auto' }}>
        {state.kind === 'loading' ? (
          <div style={{ textAlign: 'center', padding: 64 }}>
            <Spin size="large" aria-label={t('Chargement de l’accès partagé')} />
          </div>
        ) : null}
        {state.kind === 'invalid' ? <Result status="warning" title={t('Lien invalide ou expiré.')} /> : null}
        {state.kind === 'rate_limited' ? (
          <Result status="warning" title={t('Trop de tentatives, réessayez dans quelques minutes.')} />
        ) : null}
        {state.kind === 'unavailable' ? (
          <Result status="warning" title={t('Service momentanément indisponible, réessayez dans quelques minutes.')} />
        ) : null}
        {state.kind === 'ok' ? (
          <>
            <div className="external-access-no-print" style={{ textAlign: 'end', marginBlockEnd: 16 }}>
              <Button type="primary" onClick={handlePrint}>
                {t('Imprimer / enregistrer en PDF')}
              </Button>
            </div>
            <AccessView
              view={state.view}
              busyRef={busyRef}
              downloadError={downloadError}
              onDownload={handleDownload}
              printAll={printAll}
            />
          </>
        ) : null}
      </div>
    </div>
  );
};

export default ExternalAccessViewPage;
