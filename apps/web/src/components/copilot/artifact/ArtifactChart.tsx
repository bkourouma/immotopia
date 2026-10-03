import React, { useMemo } from 'react';
import {
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
import type { CopilotArtifact } from '../../../types/copilot';
import { formatArtifactCell } from '../../../utils/copilot-artifact';

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
              {artifact.xKey}
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
                {String(row[artifact.xKey] ?? '')}
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

  const axes = (
    <>
      <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
      <XAxis dataKey={artifact.xKey} tick={tick} stroke={gridColor} />
      <YAxis tick={tick} stroke={gridColor} tickFormatter={fmt} />
      <Tooltip formatter={fmt} />
      <Legend />
    </>
  );

  let chart: React.ReactElement;
  if (artifact.chartType === 'pie') {
    chart = (
      <PieChart>
        <Pie data={data} dataKey={first.key} nameKey={artifact.xKey} label isAnimationActive={false} outerRadius="75%">
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
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
  } else {
    chart = (
      <BarChart data={data}>
        {axes}
        {artifact.series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={colors[i % colors.length]} isAnimationActive={false} />
        ))}
      </BarChart>
    );
  }

  return (
    <div>
      <div role="img" aria-label={label} data-testid="artifact-chart" style={{ width: '100%', height: 320 }} dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
      <DataFallback artifact={artifact} />
    </div>
  );
};

export default ArtifactChart;
