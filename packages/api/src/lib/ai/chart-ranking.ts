import { Prisma } from '@prisma/client';
import { currentLanguage, t } from '../../i18n';
import type { ArtifactCell } from './contracts';

type Row = Record<string, ArtifactCell>;
type Ranking = {
  data: Row[];
  xKey: string;
  groupKey?: string;
  order: 'date' | 'label' | 'asc' | 'desc';
  rank?: 'asc' | 'desc';
  rankKey: string;
  rankAverage?: boolean;
  additive: string[];
  limit?: number;
};

/** Limits categories rather than cells, so all of a selected category's groups stay aligned. */
export function rankChart(input: Ranking): { data: Row[]; notices: string[] } {
  const { data, xKey, groupKey, order, rank, rankKey, additive, limit } = input;
  const groups = new Map<string, Row[]>();
  for (const row of data) {
    const label = String(row[xKey] ?? '');
    const group = groups.get(label) ?? [];
    group.push(row);
    groups.set(label, group);
  }
  const scores = new Map(
    [...groups].map(([label, rows]) => {
      const values = rows
        .map(row => row[rankKey])
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      const total = values.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
      return [label, values.length ? (input.rankAverage ? total.div(values.length) : total) : null] as const;
    })
  );
  const collator = new Intl.Collator(currentLanguage(), { numeric: true, sensitivity: 'base' });
  const compare = (sort: Ranking['order']) => (a: string, b: string) => {
    if (sort === 'date') return a < b ? -1 : a > b ? 1 : 0;
    if (sort !== 'label') {
      const left = scores.get(a);
      const right = scores.get(b);
      if (left && right) {
        const result = left.comparedTo(right);
        if (result) return sort === 'asc' ? result : -result;
      } else if (left || right) return left ? -1 : 1;
    }
    return collator.compare(a, b);
  };

  const labels = [...groups.keys()].sort(compare(order));
  if (limit === undefined || labels.length <= limit)
    return { data: labels.flatMap(label => groups.get(label)!), notices: [] };
  if (order === 'date') {
    return {
      data: labels.slice(-limit).flatMap(label => groups.get(label)!),
      notices: [
        limit === 1
          ? t('Seule la période la plus récente est affichée.')
          : t('Seules les {{count}} périodes les plus récentes sont affichées.', { count: limit })
      ]
    };
  }
  const sorted = [...labels].sort(compare(rank ?? 'desc'));
  const visible = sorted.slice(0, limit).flatMap(label => groups.get(label)!);
  const notices = [
    limit === 1
      ? t('Le graphique est limité à une catégorie.')
      : t('Le graphique est limité à {{count}} catégories.', { count: limit })
  ];
  if (!additive.length) return { data: visible, notices };
  let others = t('Autres');
  while (groups.has(others)) others += ' ·';
  const remainder = new Map<ArtifactCell, Record<string, Prisma.Decimal>>();
  for (const row of sorted.slice(limit).flatMap(label => groups.get(label)!)) {
    const group = groupKey ? (row[groupKey] ?? null) : null;
    const totals = remainder.get(group) ?? {};
    remainder.set(group, totals);
    for (const key of additive) {
      const value = row[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        totals[key] = (totals[key] ?? new Prisma.Decimal(0)).plus(value);
      }
    }
  }
  for (const [group, totals] of remainder) {
    if (!Object.keys(totals).length) continue;
    const summary: Row = { [xKey]: others, ...(groupKey ? { [groupKey]: group } : {}) };
    for (const [key, total] of Object.entries(totals)) {
      const value = total.toNumber();
      summary[key] = Number.isFinite(value) ? value : null;
    }
    visible.push(summary);
  }
  if (visible.some(row => row[xKey] === others)) {
    notices.push(t('Les valeurs additives restantes sont regroupées dans « {{label}} ».', { label: others }));
  }
  return { data: visible, notices };
}
