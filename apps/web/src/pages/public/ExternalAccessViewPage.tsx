import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Descriptions, Result, Space, Spin, Table, Typography } from 'antd';
import {
  downloadPublicExternalAccessDocument,
  fetchPublicExternalAccessView
} from '../../services/external-access-service';
import type { ExternalAccessViewDto, ExternalAccessViewProperty } from '../../types/external-access';
import { MoneyValue, statusLabel } from '../../components/primitives';
import { accessSectionLabel, accessTypeLabel } from '../patrimoine/external-access/external-access-labels';
import {
  documentTypeLabel,
  expenseCategoryLabel,
  loanStatusLabel,
  valuationMethodLabel
} from '../../components/patrimoine/patrimoine-labels';
import { legalFormLabel, fiscalCountryLabel } from '../../components/patrimoine/entities/tax-labels';
import { propertyTypeLabel } from '../../components/copilot/copilot-labels';
import type { AssetValuation, PropertyExpense, PropertyLoan } from '../../types/patrimoine-types';
import type { FiscalCountry, HoldingEntityForm } from '../../types/patrimoine-entities-types';
import { activeLocale, formatNumber, formatPercent } from '../../i18n/format';
import { t } from '../../i18n/t';

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
  .external-access-page { padding: 0 !important; background: #fff !important; }
  .external-access-page .ant-card { box-shadow: none !important; border: 1px solid #ddd !important; break-inside: avoid; }
}
`;

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(activeLocale());
}

/** Clé de ligne stable pour les tableaux dont les lignes n'ont pas d'identifiant propre. */
function keyed<T extends object>(rows: T[]): Array<T & { rowKey: string }> {
  return rows.map((row, index) => ({ ...row, rowKey: String(index) }));
}

function billingFrequencyLabel(frequency: string): string {
  if (frequency === 'MONTHLY') return t('Mensuelle');
  if (frequency === 'QUARTERLY') return t('Trimestrielle');
  if (frequency === 'YEARLY' || frequency === 'ANNUAL') return t('Annuelle');
  return frequency;
}

function fileSizeLabel(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes >= 1_048_576) return `${formatNumber(bytes / 1_048_576, { maximumFractionDigits: 1 })} ${t('Mo')}`;
  return `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} ${t('Ko')}`;
}

/** Un montant est toujours lu de gauche à droite, même dans une interface arabe. */
const Money: React.FC<{ value: number | null | undefined; currency: string; signed?: boolean }> = ({
  value,
  currency,
  signed
}) => (
  <bdi dir="ltr">
    <MoneyValue value={value} currency={currency} signed={signed} />
  </bdi>
);

const Percent: React.FC<{ value: number | null | undefined; emptyLabel?: string }> = ({ value, emptyLabel }) =>
  value === null || value === undefined ? <>{emptyLabel ?? '—'}</> : <bdi dir="ltr">{formatPercent(value, 2)}</bdi>;

// --- Rubriques ------------------------------------------------------------------------

const ValuationBlock: React.FC<{ data: NonNullable<ExternalAccessViewProperty['valuation']> }> = ({ data }) => (
  <Card size="small" title={accessSectionLabel('VALUATIONS')}>
    <Descriptions column={{ xs: 1, sm: 2 }} size="small">
      <Descriptions.Item label={t('Valeur estimée')}>
        <Money value={data.estimatedValue} currency={data.currency} />
      </Descriptions.Item>
      <Descriptions.Item label={t('Date d’estimation')}>{formatDate(data.valuatedAt)}</Descriptions.Item>
      <Descriptions.Item label={t('Coût d’acquisition')}>
        <Money value={data.acquisitionCost} currency={data.currency} />
      </Descriptions.Item>
      <Descriptions.Item label={t('Plus-value latente')}>
        <Money value={data.latentCapitalGain} currency={data.currency} signed />
      </Descriptions.Item>
    </Descriptions>
    {data.history.length > 0 ? (
      <Table
        size="small"
        rowKey="rowKey"
        pagination={false}
        scroll={{ x: 'max-content' }}
        dataSource={keyed(data.history)}
        columns={[
          { title: t('Date'), dataIndex: 'valuatedAt', render: (value: string) => formatDate(value) },
          {
            title: t('Méthode'),
            dataIndex: 'method',
            render: (value: string) => valuationMethodLabel(value as AssetValuation['method'])
          },
          {
            title: t('Valeur estimée'),
            dataIndex: 'estimatedValue',
            align: 'end' as const,
            render: (value: number) => <Money value={value} currency={data.currency} />
          }
        ]}
      />
    ) : null}
  </Card>
);

const YieldBlock: React.FC<{ data: NonNullable<ExternalAccessViewProperty['yield']>; currency: string }> = ({
  data,
  currency
}) => (
  <Card size="small" title={accessSectionLabel('YIELD_RATIOS')}>
    <Descriptions column={{ xs: 1, sm: 2 }} size="small">
      <Descriptions.Item label={t('Rendement brut')}>
        <Percent value={data.grossYield} emptyLabel={t('Non valorisé')} />
      </Descriptions.Item>
      <Descriptions.Item label={t('Rendement net')}>
        <Percent value={data.netYield} emptyLabel={t('Non valorisé')} />
      </Descriptions.Item>
      <Descriptions.Item label={t('Rendement net-net')}>
        <Percent value={data.netNetYield} />
      </Descriptions.Item>
      <Descriptions.Item label={t('Loyers annuels')}>
        <Money value={data.annualRent} currency={currency} />
      </Descriptions.Item>
      <Descriptions.Item label={t('Charges annuelles')}>
        <Money value={data.annualExpenses} currency={currency} />
      </Descriptions.Item>
    </Descriptions>
  </Card>
);

const LoansBlock: React.FC<{ loans: NonNullable<ExternalAccessViewProperty['loans']> }> = ({ loans }) => (
  <Card size="small" title={accessSectionLabel('LOANS')}>
    {loans.length === 0 ? (
      <Text type="secondary">{t('Aucun emprunt.')}</Text>
    ) : (
      <Table
        size="small"
        rowKey="rowKey"
        pagination={false}
        scroll={{ x: 'max-content' }}
        dataSource={keyed(loans)}
        columns={[
          { title: t('Prêteur'), dataIndex: 'lender' },
          {
            title: t('Capital emprunté'),
            dataIndex: 'capitalAmount',
            align: 'end' as const,
            render: (value: number, row) => <Money value={value} currency={row.currency} />
          },
          {
            title: t('Capital restant dû'),
            dataIndex: 'remainingCapital',
            align: 'end' as const,
            render: (value: number, row) => <Money value={value} currency={row.currency} />
          },
          { title: t('Taux'), dataIndex: 'interestRate', render: (value: number) => <Percent value={value} /> },
          {
            title: t('Mensualité'),
            dataIndex: 'monthlyPayment',
            align: 'end' as const,
            render: (value: number, row) => <Money value={value} currency={row.currency} />
          },
          { title: t('Début'), dataIndex: 'startDate', render: (value: string) => formatDate(value) },
          { title: t('Fin'), dataIndex: 'endDate', render: (value: string | null) => formatDate(value) },
          {
            title: t('Statut'),
            dataIndex: 'status',
            render: (value: string) => loanStatusLabel(value as PropertyLoan['status'])
          }
        ]}
      />
    )}
  </Card>
);

const ExpensesBlock: React.FC<{ data: NonNullable<ExternalAccessViewProperty['expenses']>; currency: string }> = ({
  data,
  currency
}) => (
  <Card size="small" title={accessSectionLabel('EXPENSES')}>
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: 8,
        rowGap: 2,
        marginBlockEnd: 8,
        minWidth: 0,
        overflowWrap: 'anywhere'
      }}
    >
      <Text type="secondary">{t('Total des 12 derniers mois')} :</Text>
      <Money value={data.totalLast12Months} currency={currency} />
    </div>
    {data.items.length > 0 ? (
      <Text type="secondary" style={{ display: 'block', marginBlockEnd: 8 }}>
        {t('(détail sur 24 mois)')}
      </Text>
    ) : null}
    {data.items.length > 0 ? (
      <Table
        size="small"
        rowKey="rowKey"
        pagination={false}
        scroll={{ x: 'max-content' }}
        dataSource={keyed(data.items)}
        columns={[
          { title: t('Date'), dataIndex: 'date', render: (value: string) => formatDate(value) },
          {
            title: t('Catégorie'),
            dataIndex: 'category',
            render: (value: string) => expenseCategoryLabel(value as PropertyExpense['category'])
          },
          {
            title: t('Montant'),
            dataIndex: 'amount',
            align: 'end' as const,
            render: (value: number) => <Money value={value} currency={currency} />
          }
        ]}
      />
    ) : null}
  </Card>
);

const RentsBlock: React.FC<{ rents: NonNullable<ExternalAccessViewProperty['rents']>; currency: string }> = ({
  rents,
  currency
}) => (
  <Card size="small" title={accessSectionLabel('RENTS')}>
    {rents.length === 0 ? (
      <Text type="secondary">{t('Aucun bail.')}</Text>
    ) : (
      <Table
        size="small"
        rowKey="rowKey"
        pagination={false}
        scroll={{ x: 'max-content' }}
        dataSource={keyed(rents)}
        columns={[
          { title: t('Statut'), dataIndex: 'status', render: (value: string) => statusLabel(value) ?? value },
          { title: t('Début'), dataIndex: 'startDate', render: (value: string) => formatDate(value) },
          { title: t('Fin'), dataIndex: 'endDate', render: (value: string | null) => formatDate(value) },
          {
            title: t('Loyer'),
            dataIndex: 'rentAmount',
            align: 'end' as const,
            render: (value: number) => <Money value={value} currency={currency} />
          },
          {
            title: t('Charges'),
            dataIndex: 'chargesAmount',
            align: 'end' as const,
            render: (value: number | null) => <Money value={value} currency={currency} />
          },
          {
            title: t('Facturation'),
            dataIndex: 'billingFrequency',
            render: (value: string) => billingFrequencyLabel(value)
          }
        ]}
      />
    )}
  </Card>
);

const TitlesBlock: React.FC<{ data: NonNullable<ExternalAccessViewProperty['titles']> }> = ({ data }) => (
  <Card size="small" title={accessSectionLabel('TITLES_OWNERSHIP')}>
    <Descriptions column={{ xs: 1, sm: 2 }} size="small">
      <Descriptions.Item label={t('Type de bien')}>{propertyTypeLabel(data.propertyType)}</Descriptions.Item>
      <Descriptions.Item label={t('Surface')}>
        {data.surface === null ? '—' : <bdi dir="ltr">{`${formatNumber(data.surface)} m²`}</bdi>}
      </Descriptions.Item>
      <Descriptions.Item label={t('Quote-part du propriétaire')}>
        <Percent value={data.ownerSharePercent} />
      </Descriptions.Item>
      {data.otherHoldersSharePercent !== null && data.otherHoldersSharePercent !== undefined ? (
        <Descriptions.Item label={t('Part des autres détenteurs')}>
          <Percent value={data.otherHoldersSharePercent} />
        </Descriptions.Item>
      ) : null}
    </Descriptions>
    {data.holdings.length > 0 ? (
      <Table
        size="small"
        rowKey="rowKey"
        pagination={false}
        scroll={{ x: 'max-content' }}
        dataSource={keyed(data.holdings)}
        columns={[
          { title: t('Entité détentrice'), dataIndex: 'entityName' },
          {
            title: t('Forme juridique'),
            dataIndex: 'legalForm',
            render: (value: string) => legalFormLabel(value as HoldingEntityForm)
          },
          {
            title: t('Pays'),
            dataIndex: 'country',
            render: (value: string) => fiscalCountryLabel(value as FiscalCountry)
          },
          { title: t('RCCM'), dataIndex: 'rccm', render: (value: string | null) => value ?? '—' },
          { title: t('Numéro fiscal'), dataIndex: 'taxId', render: (value: string | null) => value ?? '—' },
          { title: t('Quote-part'), dataIndex: 'sharePercent', render: (value: number) => <Percent value={value} /> }
        ]}
      />
    ) : null}
  </Card>
);

interface DocumentsBlockProps {
  documents: NonNullable<ExternalAccessViewProperty['documents']>;
  busyRef: string | null;
  onDownload: (documentRef: string) => void;
}

const DocumentsBlock: React.FC<DocumentsBlockProps> = ({ documents, busyRef, onDownload }) => (
  <Card size="small" title={accessSectionLabel('DOCUMENTS')}>
    {documents.length === 0 ? (
      <Text type="secondary">{t('Aucun document partagé.')}</Text>
    ) : (
      <Table
        size="small"
        rowKey="ref"
        pagination={false}
        scroll={{ x: 'max-content' }}
        dataSource={documents}
        columns={[
          { title: t('Document'), dataIndex: 'fileName' },
          { title: t('Type'), dataIndex: 'documentType', render: (value: string) => documentTypeLabel(value) },
          { title: t('Taille'), dataIndex: 'fileSize', render: (value: number | null) => fileSizeLabel(value) },
          {
            title: t('Action'),
            align: 'end' as const,
            render: (_: unknown, row) => (
              <span className="external-access-no-print">
                <Button
                  size="small"
                  loading={busyRef === row.ref}
                  aria-label={t('Télécharger {{name}}', { name: row.fileName })}
                  onClick={() => onDownload(row.ref)}
                >
                  {t('Télécharger')}
                </Button>
              </span>
            )
          }
        ]}
      />
    )}
  </Card>
);

// --- Page ----------------------------------------------------------------------------

interface PropertyViewProps {
  property: ExternalAccessViewProperty;
  currency: string;
  busyRef: string | null;
  onDownload: (documentRef: string) => void;
}

/** Une carte par bien : identification, puis SEULES les rubriques présentes dans la réponse. */
const PropertyView: React.FC<PropertyViewProps> = ({ property, currency, busyRef, onDownload }) => (
  <Card
    title={
      <span
        style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}
      >{`${property.reference} — ${property.title}`}</span>
    }
    styles={{ header: { height: 'auto', whiteSpace: 'normal' } }}
  >
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Descriptions column={{ xs: 1, sm: 2 }} size="small">
        <Descriptions.Item label={t('Adresse')}>
          {[property.address, property.city].filter(Boolean).join(', ') || '—'}
        </Descriptions.Item>
        {property.sharePercent !== null ? (
          <Descriptions.Item label={t('Quote-part du propriétaire')}>
            <Percent value={property.sharePercent} />
          </Descriptions.Item>
        ) : null}
      </Descriptions>
      {property.valuation ? <ValuationBlock data={property.valuation} /> : null}
      {property.valuation === null ? (
        <Card size="small" title={accessSectionLabel('VALUATIONS')}>
          <Text type="secondary">{t('Aucune valorisation.')}</Text>
        </Card>
      ) : null}
      {property.yield ? <YieldBlock data={property.yield} currency={currency} /> : null}
      {property.loans ? <LoansBlock loans={property.loans} /> : null}
      {property.expenses ? <ExpensesBlock data={property.expenses} currency={currency} /> : null}
      {property.rents ? <RentsBlock rents={property.rents} currency={currency} /> : null}
      {property.titles ? <TitlesBlock data={property.titles} /> : null}
      {property.documents ? (
        <DocumentsBlock documents={property.documents} busyRef={busyRef} onDownload={onDownload} />
      ) : null}
    </Space>
  </Card>
);

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
}

const AccessView: React.FC<ViewProps> = ({ view, busyRef, downloadError, onDownload }) => (
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
    {view.properties.map(property => (
      <PropertyView
        key={`${property.reference}-${property.title}`}
        property={property}
        currency={view.currency}
        busyRef={busyRef}
        onDownload={onDownload}
      />
    ))}
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
      { name: 'robots', content: 'noindex, nofollow' },
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
              <Button type="primary" onClick={() => window.print()}>
                {t('Imprimer / enregistrer en PDF')}
              </Button>
            </div>
            <AccessView view={state.view} busyRef={busyRef} downloadError={downloadError} onDownload={handleDownload} />
          </>
        ) : null}
      </div>
    </div>
  );
};

export default ExternalAccessViewPage;
