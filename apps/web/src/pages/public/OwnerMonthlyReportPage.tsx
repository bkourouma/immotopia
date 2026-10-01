import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Descriptions, Result, Space, Spin, Table, Tag, Typography } from 'antd';
import { fetchPublicOwnerMonthlyReport } from '../../services/patrimoine-service';
import type { OwnerMonthlyReportDto } from '../../types/patrimoine-types';
import { MoneyValue } from '../../components/primitives';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

type ViewState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'rate_limited' }
  | { kind: 'unavailable' }
  | { kind: 'ok'; report: OwnerMonthlyReportDto };

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

function lineTypeLabel(type: string): string {
  if (type === 'RENT_COLLECTED') return t('Loyer encaissé');
  if (type === 'EXPENSE_DEDUCTED') return t('Dépense déduite');
  if (type === 'MANAGEMENT_FEE') return t('Honoraires de gestion');
  if (type === 'MANAGEMENT_FEE_VAT') return t('TVA sur honoraires');
  if (type === 'ADVANCE') return t('Avance');
  if (type === 'OTHER') return t('Autre');
  return type;
}

/** « 2026-09 » -> « septembre 2026 » (dans la langue affichée). */
function periodLabel(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  if (Number.isNaN(date.getTime())) return period;
  return date.toLocaleDateString(activeLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const PRINT_CSS = `
@media print {
  .owner-report-no-print { display: none !important; }
  .owner-report-page { padding: 0 !important; background: #fff !important; }
  .owner-report-page .ant-card { box-shadow: none !important; border: 1px solid #ddd !important; break-inside: avoid; }
}
`;

const Money: React.FC<{ value: number; currency: string; signed?: boolean }> = ({ value, currency, signed }) => (
  <bdi dir="ltr">
    <MoneyValue value={value} currency={currency} signed={signed} />
  </bdi>
);

const ReportView: React.FC<{ report: OwnerMonthlyReportDto }> = ({ report }) => {
  const { totals, currency } = report;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Text type="secondary">{report.agencyName}</Text>
        <Title level={2} style={{ margin: 0 }}>
          {t('Rapport mensuel — {{period}}', { period: periodLabel(report.period) })}
        </Title>
        <Text>
          {t('Propriétaire')} : {report.ownerName}
        </Text>
      </div>

      <Card title={t('Synthèse')}>
        <Descriptions bordered column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label={t('Loyers appelés')}>
            <Money value={totals.totalRentDue} currency={currency} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Loyers encaissés')}>
            <Money value={totals.totalRevenue} currency={currency} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Restant dû par les locataires')}>
            <Money value={totals.totalArrears} currency={currency} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Honoraires de gestion')}>
            <Money value={totals.managementFees} currency={currency} />
          </Descriptions.Item>
          <Descriptions.Item label={t('TVA sur honoraires')}>
            <Money value={totals.managementFeesVat} currency={currency} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Dépenses')}>
            <Money value={totals.totalExpenses} currency={currency} />
          </Descriptions.Item>
          {totals.withholdingTax > 0 ? (
            <Descriptions.Item label={t('Retenue à la source')}>
              <Money value={totals.withholdingTax} currency={currency} />
            </Descriptions.Item>
          ) : null}
          {totals.depositRetained > 0 ? (
            <Descriptions.Item label={t('Dépôt de garantie conservé')}>
              <Money value={totals.depositRetained} currency={currency} />
            </Descriptions.Item>
          ) : null}
          <Descriptions.Item label={t('Net à reverser')} span="filled">
            <strong>
              <Money value={totals.netAmount} currency={currency} signed />
            </strong>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {report.properties.map(property => (
        <Card key={`${property.reference}-${property.title}`} title={`${property.reference} — ${property.title}`}>
          <Table
            scroll={{ x: 'max-content' }}
            rowKey="key"
            size="small"
            pagination={false}
            dataSource={property.lines.map((line, index) => ({ ...line, key: `${index}` }))}
            columns={[
              { title: t('Libellé'), dataIndex: 'label' },
              {
                title: t('Type'),
                dataIndex: 'type',
                render: (value: string) => <Tag>{lineTypeLabel(value)}</Tag>
              },
              {
                title: t('Montant'),
                dataIndex: 'amount',
                align: 'end' as const,
                render: (value: number) => <Money value={value} currency={currency} />
              }
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>
                  <strong>{t('Sous-total')}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="end">
                  <strong>
                    <Money value={property.subtotal} currency={currency} />
                  </strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Card>
      ))}

      <Text type="secondary">
        {t('Ce lien expire le {{date}}.', { date: new Date(report.expiresAt).toLocaleString(activeLocale()) })}
      </Text>
    </Space>
  );
};

/**
 * Page publique du rapport mensuel d'un propriétaire (lien sécurisé, spec 031).
 * Lecture seule, sans session : le jeton vient du fragment de l'adresse et part
 * dans le corps d'un POST. Les échecs de lien (inconnu, expiré, révoqué) se confondent en un
 * seul écran « lien invalide » ; une panne du service (5xx, réseau) a son propre écran.
 */
export const OwnerMonthlyReportPage: React.FC = () => {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  // Le jeton survit au double montage de React.StrictMode : le fragment n'est lu qu'une fois.
  const tokenRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = t('Rapport mensuel');
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
      setView({ kind: 'invalid' });
      return undefined;
    }
    let cancelled = false;
    void fetchPublicOwnerMonthlyReport(token).then(result => {
      if (cancelled) return;
      if (result.status === 'ok') setView({ kind: 'ok', report: result.report });
      else setView({ kind: result.status });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="owner-report-page"
      style={{ minHeight: '100vh', padding: '24px 16px', background: 'var(--color-bg-layout, #f5f5f5)' }}
    >
      <style>{PRINT_CSS}</style>
      <div style={{ maxWidth: 960, marginInline: 'auto' }}>
        {view.kind === 'loading' ? (
          <div style={{ textAlign: 'center', padding: 64 }}>
            <Spin size="large" aria-label={t('Chargement du rapport')} />
          </div>
        ) : null}
        {view.kind === 'invalid' ? (
          <Result
            status="warning"
            title={t('Ce lien est invalide ou a expiré. Demandez un nouveau lien à votre agence.')}
          />
        ) : null}
        {view.kind === 'rate_limited' ? (
          <Result status="warning" title={t('Trop de tentatives, réessayez dans quelques minutes.')} />
        ) : null}
        {view.kind === 'unavailable' ? (
          <Result status="warning" title={t('Service momentanément indisponible, réessayez dans quelques minutes.')} />
        ) : null}
        {view.kind === 'ok' ? (
          <>
            <div className="owner-report-no-print" style={{ textAlign: 'end', marginBlockEnd: 16 }}>
              <Button type="primary" onClick={() => window.print()}>
                {t('Imprimer / enregistrer en PDF')}
              </Button>
            </div>
            <ReportView report={view.report} />
          </>
        ) : null}
      </div>
    </div>
  );
};

export default OwnerMonthlyReportPage;
