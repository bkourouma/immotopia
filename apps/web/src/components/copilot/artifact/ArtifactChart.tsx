/// <reference lib="es2022.intl" />
import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useAssistantTranslation } from '../../../i18n/useAssistantTranslation';
import { useLanguage } from '../../../i18n/useLanguage';
import type { ChartScene, CopilotArtifact } from '../../../types/copilot';
import { chartXLabel, formatArtifactCell } from '../../../utils/copilot-artifact';

const chartFontFamily = 'Arial, sans-serif';

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
const DataFallback: React.FC<{ artifact: ChartArtifact }> = ({ artifact }) => {
  const { t, locale } = useAssistantTranslation();
  return (
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
              {artifact.groupKey && (
                <th scope="col" style={{ textAlign: 'start' }}>
                  {artifact.groupLabel ?? artifact.groupKey}
                </th>
              )}
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
                  <bdi>
                    {artifact.chartType === 'scatter'
                      ? formatArtifactCell(row[artifact.xKey] ?? null, 'number', locale)
                      : String(row[artifact.xKey] ?? '')}
                  </bdi>
                </th>
                {artifact.groupKey && (
                  <td>
                    <bdi>{String(row[artifact.groupKey] ?? '')}</bdi>
                  </td>
                )}
                {artifact.series.map(s => (
                  <td key={s.key}>{formatArtifactCell(row[s.key] ?? null, 'number', locale)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
};

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : undefined;

function SceneFigure({ scene, rtl }: { scene: ChartScene; rtl: boolean }) {
  return (
    <svg
      data-chart-surface="true"
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    >
      {scene.marks.map((mark, index) => {
        const x = rtl ? scene.width - mark.x - mark.w : mark.x;
        if (mark.kind === 'rect')
          return (
            <rect key={index} x={x} y={mark.y} width={mark.w} height={mark.h} fill={`#${mark.color}`}>
              {mark.tip && <title>{mark.tip}</title>}
            </rect>
          );
        const letters = segmenter
          ? Array.from(segmenter.segment(mark.text), item => item.segment)
          : Array.from(mark.text);
        const size = Math.min(22, mark.h * 0.8, Math.max(9, mark.w / (Math.max(1, letters.length) * 0.58)));
        const cap = Math.max(1, Math.floor(mark.w / (size * 0.58)));
        const label = letters.length > cap ? letters.slice(0, cap - 1).join('') + '…' : mark.text;
        const from =
          mark.align === 'start' ? (rtl ? mark.w : 0) : mark.align === 'end' ? (rtl ? 0 : mark.w) : mark.w / 2;
        return (
          <text
            key={index}
            x={x + from}
            y={mark.y + mark.h / 2}
            fill={`#${mark.color}`}
            fontFamily={chartFontFamily}
            fontSize={size}
            dominantBaseline="central"
            direction={rtl ? 'rtl' : 'ltr'}
            textAnchor={mark.align === 'start' ? 'start' : mark.align === 'end' ? 'end' : 'middle'}
          >
            <title>{mark.text}</title>
            {label}
          </text>
        );
      })}
    </svg>
  );
}

export const ArtifactChart: React.FC<{ artifact: ChartArtifact }> = ({ artifact }) => {
  const { rtl: interfaceRtl } = useLanguage();
  const { t, selected, locale } = useAssistantTranslation();
  const rtl = selected ? selected === 'ar' : interfaceRtl;
  const direction = rtl ? 'rtl' : 'ltr';
  const colors = useMemo(() => PALETTE_TOKENS.map(([name, fallback]) => cssVar(name, fallback)), []);
  const textColor = useMemo(() => cssVar('--text-secondary', '#525252'), []);
  const gridColor = useMemo(() => cssVar('--border-subtle', '#e5e5e5'), []);

  const allData = useMemo(
    () =>
      artifact.data.map(row => {
        const out: Record<string, string | number | null> = {
          [artifact.xKey]: artifact.chartType === 'scatter' ? num(row[artifact.xKey]) : String(row[artifact.xKey] ?? '')
        };
        for (const s of artifact.series) out[s.key] = num(row[s.key]);
        return out;
      }),
    [artifact]
  );
  const [zoom, setZoom] = useState<{ rows: typeof allData; size: number; start: number } | null>(null);
  const parts = artifact.chartType === 'pie' || artifact.chartType === 'donut';
  const zoomable =
    !artifact.scene && artifact.chartType !== 'scatter' && (!parts || allData.length > 8) && allData.length > 24;
  const viewport = zoomable && zoom?.rows === allData ? zoom : { rows: allData, size: allData.length, start: 0 };
  const data = zoomable ? allData.slice(viewport.start, viewport.start + viewport.size) : allData;
  const notices = artifact.notices?.map((message, index) => (
    <p key={index} role="status">
      {message}
    </p>
  ));

  const label = t('Graphique : {{title}} ({{count}} valeurs)', { title: artifact.title, count: data.length });
  const tick = { fill: textColor, fontSize: 12 };
  const fmt = (v: unknown) => (typeof v === 'number' ? formatArtifactCell(v, 'number', locale) : String(v ?? ''));
  const first = artifact.series[0];
  if (artifact.scene) {
    return (
      <div>
        <div
          role="img"
          aria-label={label}
          data-testid="artifact-chart"
          dir={direction}
          style={{ width: '100%', aspectRatio: artifact.scene.width / artifact.scene.height, maxHeight: 340 }}
        >
          <SceneFigure scene={artifact.scene} rtl={rtl} />
        </div>
        {notices}
        <DataFallback artifact={artifact} />
      </div>
    );
  }
  const values = data.flatMap(row =>
    artifact.series.map(series => num(row[series.key])).filter(value => value !== null)
  );
  const validParts =
    parts &&
    artifact.series.length === 1 &&
    data.length >= 2 &&
    allData.length <= 8 &&
    values.every(value => value >= 0) &&
    values.some(value => value > 0);
  const horizontal = artifact.chartType === 'horizontal_bar' || (parts && allData.length > 8);
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
          <XAxis
            dataKey={artifact.xKey}
            tick={tick}
            stroke={gridColor}
            reversed={rtl}
            interval={data.length <= 12 ? 0 : 'preserveStartEnd'}
          />
          <YAxis tick={tick} stroke={gridColor} tickFormatter={fmt} orientation={rtl ? 'right' : 'left'} />
        </>
      )}
      <Tooltip formatter={fmt} />
      <Legend />
    </>
  );

  let chart: React.ReactElement;
  if (artifact.chartType === 'scatter') {
    chart = (
      <ScatterChart margin={{ bottom: 18, top: 12 }}>
        <CartesianGrid stroke={gridColor} />
        <XAxis
          type="number"
          dataKey={artifact.xKey}
          name={chartXLabel(artifact)}
          tick={tick}
          tickFormatter={fmt}
          reversed={rtl}
          domain={['auto', 'auto']}
          label={{ value: chartXLabel(artifact), position: 'insideBottom', offset: -8 }}
        />
        <YAxis
          type="number"
          dataKey={first.key}
          name={first.label}
          tick={tick}
          tickFormatter={fmt}
          orientation={rtl ? 'right' : 'left'}
          domain={['auto', 'auto']}
        />
        <Tooltip formatter={fmt} />
        <Scatter
          data={data.filter(row => row[artifact.xKey] !== null && row[first.key] !== null)}
          name={first.label}
          fill={colors[0]}
          isAnimationActive={false}
        />
        <Legend verticalAlign="top" />
      </ScatterChart>
    );
  } else if (artifact.chartType === 'combo') {
    chart = (
      <ComposedChart data={data}>
        <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
        <XAxis
          dataKey={artifact.xKey}
          tick={tick}
          stroke={gridColor}
          reversed={rtl}
          interval={data.length <= 12 ? 0 : 'preserveStartEnd'}
        />
        <YAxis yAxisId="primary" tick={tick} tickFormatter={fmt} orientation={rtl ? 'right' : 'left'} />
        {artifact.series.some(series => series.axis === 'secondary') && (
          <YAxis yAxisId="secondary" tick={tick} tickFormatter={fmt} orientation={rtl ? 'left' : 'right'} />
        )}
        <Tooltip formatter={fmt} />
        <Legend />
        {artifact.series.map((series, index) => {
          const common = {
            yAxisId: series.axis ?? 'primary',
            dataKey: series.key,
            name: series.label,
            isAnimationActive: false
          };
          return series.form === 'line' ? (
            <Line
              key={series.key}
              {...common}
              stroke={colors[index % colors.length]}
              strokeWidth={2}
              dot={data.length <= 24}
            />
          ) : (
            <Bar key={series.key} {...common} fill={colors[index % colors.length]} maxBarSize={40} />
          );
        })}
      </ComposedChart>
    );
  } else if (validParts) {
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
            dot={data.length <= 24}
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
            maxBarSize={40}
            radius={artifact.chartType === 'stacked_bar' ? 0 : 4}
          />
        ))}
      </BarChart>
    );
  }

  return (
    <div>
      {zoomable && (
        <div style={{ display: 'grid', gap: 4, marginBlockEnd: 8 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('Nombre de catégories visibles')}
            <input
              type="range"
              min={1}
              max={allData.length}
              value={viewport.size}
              onChange={event => {
                const size = Number(event.currentTarget.value);
                setZoom({ rows: allData, size, start: Math.min(viewport.start, allData.length - size) });
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('Première catégorie visible')}
            <input
              type="range"
              min={1}
              max={allData.length - viewport.size + 1}
              value={viewport.start + 1}
              disabled={viewport.size === allData.length}
              onChange={event => setZoom({ ...viewport, start: Number(event.currentTarget.value) - 1 })}
            />
          </label>
          <small aria-live="polite">
            {t('Catégories {{first}} à {{last}} sur {{total}}', {
              first: viewport.start + 1,
              last: viewport.start + viewport.size,
              total: allData.length
            })}
          </small>
        </div>
      )}
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
      {notices}
      {parts && !validParts && <p>{t('Les données sont présentées en barres pour faciliter leur lecture.')}</p>}
      <DataFallback artifact={artifact} />
    </div>
  );
};

export default ArtifactChart;
