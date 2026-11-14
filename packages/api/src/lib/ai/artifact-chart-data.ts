import type { CopilotArtifact } from './contracts';

export type ChartArtifact = Extract<CopilotArtifact, { kind: 'chart' }>;

export const chartColors = ['2164AC', '0B7666', 'A05019', '7746A3', 'AB365C', '58702E', '765B38', '365979'];

export function chartExportData(artifact: ChartArtifact) {
  const labels = artifact.data.map(row => String(row[artifact.xKey] ?? '—'));
  const series = artifact.series.map(({ key, label: name }) => ({
    name,
    values: artifact.data.map(row => {
      const value = row[key];
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    })
  }));
  const values = series.flatMap(row => row.values.filter((value): value is number => value !== null));
  const pie = artifact.chartType === 'pie';
  const usePie =
    pie &&
    series.length === 1 &&
    labels.length <= 8 &&
    values.every(value => value >= 0) &&
    values.some(value => value > 0);
  return {
    labels,
    series,
    values,
    type: pie ? (usePie ? ('pie' as const) : ('bar' as const)) : artifact.chartType,
    fallback: pie && !usePie
  };
}
