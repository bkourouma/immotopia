import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { t } from '../../../i18n/t';
import { useLanguage } from '../../../i18n/useLanguage';
import type { CopilotArtifact } from '../../../types/copilot';
import { chartXLabel, formatArtifactCell } from '../../../utils/copilot-artifact';

type ChartArtifact = Extract<CopilotArtifact, { kind: 'chart' }>;

/** Jetons du thème et leur repli ; résolus en valeurs pour que le PNG exporté garde les couleurs. */
const PALETTE_TOKENS: [string, string][] = [
  ['--color-primary', '#1d4ed8'],
  ['--color-accent', '#f97316'],
  ['--color-success', '#16a34a'],
  ['--color-warning', '#ca8a04'],
  ['--color-error', '#dc2626'],
  ['--blue-400', '#60a5fa']
];

function cssVar(name: string, fallback: string): string {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value && !value.startsWith('var(') ? value : fallback;
  } catch {
    return fallback;
  }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Tableau de données de repli, lisible par les lecteurs d'écran. */
const DataFallback: React.FC<{ artifact: ChartArtifact }> = ({ artifact }) => (
  <details style={{ marginBlockStart: 8 }}>
    <summary>{t('Afficher les données du graphique')}</summary>
    <div style={{ overflow: 'auto', maxHeight: 240 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <caption style={{ textAlign: 'start' }}>{artifact.title}</caption>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'start' }}>
              {chartXLabel(artifact)}
            </th>
            {artifact.series.map(s => (
              <th key={s.key} scope="col" style={{ textAlign: 'start' }}>
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {artifact.data.map((row, i) => (
            <tr key={i}>
              <th scope="row" style={{ textAlign: 'start', fontWeight: 'normal' }}>
                <bdi>{String(row[artifact.xKey] ?? '')}</bdi>
              </th>
              {artifact.series.map(s => (
                <td key={s.key}>{formatArtifactCell(row[s.key] ?? null, 'number')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </details>
);

export const ArtifactChart: React.FC<{ artifact: ChartArtifact }> = ({ artifact }) => {
  const { direction, rtl } = useLanguage();
  const colors = useMemo(() => PALETTE_TOKENS.map(([name, fallback]) => cssVar(name, fallback)), []);
  const textColor = useMemo(() => cssVar('--text-secondary', '#525252'), []);
  const gridColor = useMemo(() => cssVar('--border-subtle', '#e5e5e5'), []);

  const data = useMemo(
    () =>
      artifact.data.map(row => {
        const out: Record<string, string | number | null> = { [artifact.xKey]: String(row[artifact.xKey] ?? '') };
        for (const s of artifact.series) out[s.key] = num(row[s.key]);
        return out;
      }),
    [artifact]
  );

  const label = t('Graphique : {{title}} ({{count}} valeurs)', { title: artifact.title, count: data.length });
  const tick = { fill: textColor, fontSize: 12 };
  const fmt = (v: unknown) => (typeof v === 'number' ? formatArtifactCell(v, 'number') : String(v ?? ''));
  const first = artifact.series[0];
  const values = data.flatMap(row =>
    artifact.series.map(series => num(row[series.key])).filter(value => value !== null)
  );
  const parts = artifact.chartType === 'pie' || artifact.chartType === 'donut';
  const validParts =
    parts &&
    artifact.series.length === 1 &&
    data.length >= 2 &&
    data.length <= 8 &&
    values.every(value => value >= 0) &&
    values.some(value => value > 0);
  const horizontal = artifact.chartType === 'horizontal_bar';
  const donut = artifact.chartType === 'donut';
  const total = donut ? values.reduce((sum, value) => sum + value, 0) : undefined;

  const axes = (
    <>
      <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
      {horizontal ? (
        <>
          <XAxis type="number" tick={tick} stroke={gridColor} tickFormatter={fmt} reversed={rtl} />
          <YAxis
            type="category"
            dataKey={artifact.xKey}
            tick={tick}
            stroke={gridColor}
            orientation={rtl ? 'right' : 'left'}
            width={112}
            interval={Math.max(0, Math.ceil(data.length / 20) - 1)}
          />
        </>
      ) : (
        <>
          <XAxis dataKey={artifact.xKey} tick={tick} stroke={gridColor} reversed={rtl} />
          <YAxis tick={tick} stroke={gridColor} tickFormatter={fmt} orientation={rtl ? 'right' : 'left'} />
        </>
      )}
      <Tooltip formatter={fmt} />
      <Legend />
    </>
  );

  let chart: React.ReactElement;
  if (validParts) {
    chart = (
      <PieChart>
        <Pie
          data={data}
          dataKey={first.key}
          nameKey={artifact.xKey}
          label
          isAnimationActive={false}
          outerRadius="75%"
          innerRadius={donut ? '45%' : 0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        {Number.isFinite(total) && (
          <text x="50%" y="50%" dy="0.3em" textAnchor="middle" fill={textColor}>
            {fmt(total)}
          </text>
        )}
        <Tooltip formatter={fmt} />
        <Legend />
      </PieChart>
    );
  } else if (artifact.chartType === 'line') {
    chart = (
      <LineChart data={data}>
        {axes}
        {artifact.series.map((s, i) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={colors[i % colors.length]}
            strokeWidth={2}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    );
  } else if (artifact.chartType === 'area' || artifact.chartType === 'stacked_area') {
    chart = (
      <AreaChart data={data}>
        {axes}
        {artifact.series.map((s, i) => (
          <Area
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={colors[i % colors.length]}
            fill={colors[i % colors.length]}
            fillOpacity={0.28}
            stackId={artifact.chartType === 'stacked_area' ? 'values' : undefined}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    );
  } else {
    chart = (
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} stackOffset="sign">
        {axes}
        {artifact.series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={colors[i % colors.length]}
            isAnimationActive={false}
            stackId={artifact.chartType === 'stacked_bar' ? 'values' : undefined}
          />
        ))}
      </BarChart>
    );
  }

  return (
    <div>
      <div
        role="img"
        aria-label={label}
        data-testid="artifact-chart"
        style={{ width: '100%', height: horizontal ? Math.min(640, 80 + 28 * data.length) : 320 }}
        dir={direction}
      >
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
      {parts && !validParts && <p>{t('Les données sont présentées en barres pour faciliter leur lecture.')}</p>}
      <DataFallback artifact={artifact} />
    </div>
  );
};

export default ArtifactChart;
