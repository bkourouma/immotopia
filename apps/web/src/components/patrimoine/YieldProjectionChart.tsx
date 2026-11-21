import React from 'react';
import { Card, Table } from 'antd';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { YieldProjectionPoint } from '../../types/patrimoine-types';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { activeLocale } from '../../i18n/format';
import { CHART_SERIES, compactNumber, markerDot } from './chart-palette';

interface Props {
  data: YieldProjectionPoint[];
}

// recharts types a tooltip/axis value as ValueType, which also covers arrays
// of values; accept that shape and reduce it to a single number.
const formatNumber = (value: unknown): string => {
  const raw = Array.isArray(value) ? value[0] : value;
  return Number(raw ?? 0).toLocaleString(activeLocale());
};

export const YieldProjectionChart: React.FC<Props> = ({ data }) => {
  const { isMobile } = useBreakpoint();

  const first = data[0];
  const last = data[data.length - 1];
  const summary = first
    ? t(
        'Graphique de projection de rendement, de l’année {{debut}} à l’année {{fin}} : valeur estimée de {{valeurDebut}} à {{valeurFin}}, résultat net de {{netDebut}} à {{netFin}}. Les valeurs figurent dans le tableau « Voir les valeurs en tableau ».',
        {
          debut: first.year,
          fin: last.year,
          valeurDebut: formatNumber(first.estimatedValue),
          valeurFin: formatNumber(last.estimatedValue),
          netDebut: formatNumber(first.netResult),
          netFin: formatNumber(last.netResult)
        }
      )
    : t('Graphique de projection de rendement : aucune donnée.');

  const tableColumns = [
    { title: t('Année'), dataIndex: 'year', key: 'year' },
    ...(
      [
        ['estimatedValue', t('Valeur estimée')],
        ['cumulativeRent', t('Loyers cumulés')],
        ['cumulativeExpenses', t('Charges cumulées')],
        ['netResult', t('Résultat net')]
      ] as const
    ).map(([key, title]) => ({
      title,
      dataIndex: key,
      key,
      align: 'end' as const,
      render: (value: unknown) => formatNumber(value)
    }))
  ];

  const series = [
    { key: 'estimatedValue', name: t('Valeur estimée'), style: CHART_SERIES.primary },
    { key: 'cumulativeRent', name: t('Loyers cumulés'), style: CHART_SERIES.secondary },
    { key: 'cumulativeExpenses', name: t('Charges cumulées'), style: CHART_SERIES.tertiary },
    { key: 'netResult', name: t('Résultat net'), style: CHART_SERIES.quaternary }
  ];

  return (
    <Card title={<HelpSectionTitle title={t('Projection de rendement')} helpId="patrimoine.performance.projection" />}>
      <div role="img" aria-label={summary} style={{ width: '100%', height: isMobile ? 280 : 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: isMobile ? 8 : 20, left: isMobile ? 0 : 12, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis
              width={isMobile ? 52 : 80}
              tickMargin={8}
              tickFormatter={value => compactNumber(value, activeLocale())}
            />
            <Tooltip formatter={formatNumber} />
            <Legend wrapperStyle={{ whiteSpace: 'normal' }} />
            {series.map(({ key, name, style }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={name}
                stroke={style.color}
                strokeDasharray={style.dash}
                strokeWidth={2}
                dot={markerDot(style.marker)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {data.length > 0 ? (
        <details style={{ marginTop: 'var(--space-3)' }}>
          <summary style={{ cursor: 'pointer', minHeight: 40, display: 'flex', alignItems: 'center' }}>
            {t('Voir les valeurs en tableau')}
          </summary>
          <Table
            size="small"
            rowKey="year"
            pagination={false}
            dataSource={data}
            columns={tableColumns}
            scroll={{ x: 'max-content' }}
          />
        </details>
      ) : null}
    </Card>
  );
};
