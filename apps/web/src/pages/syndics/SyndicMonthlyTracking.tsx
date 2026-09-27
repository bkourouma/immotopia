import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Space, Spin, Tooltip, Typography } from 'antd';
import { formatMoney, MoneyValue } from '../../components/primitives';
import { getMonthlyTracking } from '../../services/syndic-lot-payment-service';
import { MonthlyTracking, MonthlyTrackingStatus } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

const { Paragraph, Title, Text } = Typography;

const MONTH_LABELS = [
  t('Janv.'),
  t('Févr.'),
  t('Mars'),
  t('Avr.'),
  t('Mai'),
  t('Juin'),
  t('Juil.'),
  t('Août'),
  t('Sept.'),
  t('Oct.'),
  t('Nov.'),
  t('Déc.')
];

/**
 * Couleurs et libellés d'un mois du suivi (lot S2, besoin 5). Le libellé
 * n'est jamais que décoratif : la légende et le texte de la cellule portent
 * l'information, la couleur seule ne suffit jamais (accessibilité).
 */
const STATUS_CONFIG: Record<MonthlyTrackingStatus, { color: string; textColor: string; label: string }> = {
  PAID: { color: 'var(--color-success-bg, #e6f7e9)', textColor: 'var(--color-success-text, #237a3f)', label: t('Réglé') },
  PARTIAL: { color: 'var(--color-warning-bg, #fff3e0)', textColor: 'var(--color-warning-text, #ad6800)', label: t('Partiel') },
  DUE: { color: 'var(--color-info-bg, #e6f0ff)', textColor: 'var(--color-info-text, #1d4ed8)', label: t('Dû') },
  OVERDUE: { color: 'var(--color-error-bg, #fde8e8)', textColor: 'var(--color-error-text, #c0202c)', label: t('En retard') },
  NONE: { color: 'transparent', textColor: 'var(--text-secondary, #999)', label: t('—') }
};

function yearRange(current: number): number[] {
  const years: number[] = [];
  for (let year = current - 3; year <= current + 1; year += 1) {
    years.push(year);
  }
  return years;
}

export const SyndicMonthlyTracking: React.FC = () => {
  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [tracking, setTracking] = useState<MonthlyTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres suivi mensuel manquants'));
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getMonthlyTracking(effectiveTenantId, syndicId, year)
      .then(data => {
        if (!cancelled) setTracking(data);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.response?.data?.error || t('Impossible de charger le suivi mensuel'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveTenantId, syndicId, year]);

  const years = useMemo(() => yearRange(new Date().getFullYear()), []);
  const currency = tracking?.currency;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <Space direction="vertical" size={4}>
          <Title level={2} style={{ margin: 0 }}>
            {t('Suivi mensuel')}
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {t('Chaque lot, mois par mois : réglé, partiel, dû ou en retard.')}
          </Paragraph>
        </Space>

        <label>
          <Text style={{ marginInlineEnd: 8 }}>{t('Exercice')}</Text>
          <select
            aria-label={t('Exercice')}
            value={year}
            onChange={event => setYear(Number(event.target.value))}
            style={{ padding: '4px 8px', borderRadius: 6 }}
          >
            {years.map(candidate => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <Alert type="error" message={error} showIcon /> : null}

      {loading ? (
        <div style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'start', padding: 8, whiteSpace: 'nowrap' }}>{t('Lot')}</th>
                  <th style={{ textAlign: 'start', padding: 8, whiteSpace: 'nowrap' }}>{t('Copropriétaire')}</th>
                  {MONTH_LABELS.map(label => (
                    <th key={label} style={{ textAlign: 'center', padding: 8, minWidth: 72 }}>
                      {label}
                    </th>
                  ))}
                  <th style={{ textAlign: 'end', padding: 8, whiteSpace: 'nowrap' }}>{t('Avance')}</th>
                </tr>
              </thead>
              <tbody>
                {(tracking?.lots ?? []).map(row => (
                  <tr key={row.lotId}>
                    <td style={{ padding: 8, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.lotNumber}</td>
                    <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{row.ownerName || t('Sans copropriétaire')}</td>
                    {row.months.map(cell => {
                      const config = STATUS_CONFIG[cell.status];
                      const tooltip = t('{{label}} — dû {{due}}, réglé {{paid}}', {
                        label: config.label,
                        due: formatMoney(cell.due, { currency }),
                        paid: formatMoney(cell.paid, { currency })
                      });
                      return (
                        <td key={cell.month} style={{ padding: 4, textAlign: 'center' }}>
                          <Tooltip title={tooltip}>
                            <div
                              role="img"
                              aria-label={tooltip}
                              style={{
                                backgroundColor: config.color,
                                color: config.textColor,
                                borderRadius: 6,
                                padding: '4px 2px',
                                fontSize: 12,
                                fontWeight: 600,
                                lineHeight: 1.2
                              }}
                            >
                              {config.label}
                            </div>
                          </Tooltip>
                        </td>
                      );
                    })}
                    <td style={{ padding: 8, textAlign: 'end', whiteSpace: 'nowrap' }}>
                      <MoneyValue value={row.advance} currency={currency} />
                    </td>
                  </tr>
                ))}
                {(tracking?.lots?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={15} style={{ padding: 16, textAlign: 'center' }}>
                      {t('Aucun lot pour cette copropriété.')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <Space wrap size={16} style={{ marginTop: 16 }} aria-label={t('Légende')}>
            {(Object.keys(STATUS_CONFIG) as MonthlyTrackingStatus[]).map(status => {
              const config = STATUS_CONFIG[status];
              return (
                <Space key={status} size={6}>
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      backgroundColor: config.color,
                      border: status === 'NONE' ? '1px solid var(--border-color, #ccc)' : undefined
                    }}
                  />
                  <Text>{config.label}</Text>
                </Space>
              );
            })}
          </Space>
        </Card>
      )}
    </Space>
  );
};
