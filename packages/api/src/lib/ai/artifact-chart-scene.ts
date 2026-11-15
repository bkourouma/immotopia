import { currentAssistantLanguage, t } from '../../i18n';
import type { ChartMark, ChartScene } from './contracts';

const width = 640;
const height = 300;
const ink = '172D46';
const empty = 'E7EDF4';
const palette = ['245B9B', '166675', '77518E', '975529', '395F9A', '52647A', '5B57A6', '8B4878'];
const format = (value: number) =>
  new Intl.NumberFormat(currentAssistantLanguage(), { maximumFractionDigits: 2 }).format(value);
const compact = (value: number) =>
  new Intl.NumberFormat(currentAssistantLanguage(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);

type Datum = { category: string; group?: string; value: number | null };
type Tile = { x: number; y: number; w: number; h: number };
type SceneType = 'heatmap' | 'treemap' | 'funnel' | 'gauge';
type Gauge = { value: number; max: number; percent: boolean; target?: number };

function partition<T>(items: T[], tile: Tile, weight: (item: T) => number, draw: (item: T, tile: Tile) => void) {
  if (items.length < 2) {
    if (items[0]) draw(items[0], tile);
    return;
  }
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let cut = 1;
  let left = weight(items[0]);
  while (cut < items.length - 1 && left + weight(items[cut]) / 2 < total / 2) left += weight(items[cut++]);
  const ratio = total > 0 ? left / total : cut / items.length;
  const horizontal = tile.w >= tile.h;
  const edge = (horizontal ? tile.w : tile.h) * ratio;
  const first = horizontal ? { ...tile, w: edge } : { ...tile, h: edge };
  const next = horizontal
    ? { ...tile, x: tile.x + edge, w: tile.w - edge }
    : { ...tile, y: tile.y + edge, h: tile.h - edge };
  partition(items.slice(0, cut), first, weight, draw);
  partition(items.slice(cut), next, weight, draw);
}

export function chartScene(type: SceneType, entries: Datum[], gauge?: Gauge): ChartScene {
  const marks: ChartMark[] = [];
  const rect = ({ x, y, w, h }: Tile, color: string, tip?: string) => {
    if (w > 0.1 && h > 0.1) marks.push({ kind: 'rect', x, y, w, h, color, ...(tip ? { tip } : {}) });
  };
  const text = ({ x, y, w, h }: Tile, value: string, color = ink, align: 'start' | 'center' | 'end' = 'center') => {
    if (w >= 19 && h >= 12 && value) marks.push({ kind: 'text', x, y, w, h, color, text: value.slice(0, 180), align });
  };

  if (type === 'heatmap') {
    const xs = [...new Set(entries.map(entry => entry.category))];
    const ys = [...new Set(entries.map(entry => entry.group ?? ''))];
    const cells = new Map(entries.map(entry => [JSON.stringify([entry.category, entry.group ?? '']), entry.value]));
    const max = Math.max(1e-300, ...entries.map(entry => Math.abs(entry.value ?? 0)));
    const cols = 500 / xs.length;
    const rows = 216 / ys.length;
    xs.forEach((label, i) => text({ x: 122 + i * cols, y: 18, w: cols, h: 18 }, label));
    ys.forEach((group, i) => {
      const y = 42 + i * rows;
      text({ x: 10, y: y + (rows - 18) / 2, w: 104, h: 18 }, group, ink, 'end');
      xs.forEach((category, j) => {
        const value = cells.get(JSON.stringify([category, group])) ?? null;
        const x = 122 + j * cols;
        const fraction = value === null ? 0 : Math.abs(value / max);
        const endpoint = value !== null && value < 0 ? [120, 66, 154] : [32, 76, 145];
        const rgb = endpoint.map(channel => Math.round(246 + (channel - 246) * fraction));
        const luminance = rgb
          .map(channel => channel / 255)
          .map(component => (component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4));
        const dark = luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722 < 0.179;
        const color = value === null ? empty : rgb.map(channel => channel.toString(16).padStart(2, '0')).join('');
        rect(
          { x, y, w: cols - 1, h: rows - 1 },
          color,
          `${category} · ${group}: ${value === null ? '—' : format(value)}`
        );
        if (xs.length * ys.length <= 100) {
          text(
            { x: x + 1, y: y + (rows - 16) / 2, w: cols - 3, h: 16 },
            value === null ? '—' : compact(value),
            dark ? 'FFFFFF' : '000000'
          );
        } else if (value === null) {
          const dash = Math.min(12, cols * 0.35);
          rect({ x: x + (cols - dash) / 2, y: y + (rows - 1.4) / 2, w: dash, h: 1.4 }, '5C7187');
        }
      });
    });
    [
      { color: '78429A', label: t('Négatif') },
      { color: 'F6F6F6', label: '0' },
      { color: '204C91', label: t('Positif') },
      { color: empty, label: t('Sans donnée') }
    ].forEach(({ color, label }, index) => {
      const x = 120 + index * 125;
      rect({ x, y: 271, w: 13, h: 13 }, color);
      text({ x: x + 17, y: 268, w: 102, h: 18 }, label, ink, 'start');
    });
  } else if (type === 'treemap') {
    const positive = entries.filter(entry => (entry.value ?? 0) > 0);
    const maximum = Math.max(1e-300, ...positive.map(entry => entry.value!));
    const groups = new Map<string, Datum[]>();
    for (const entry of positive) {
      const key = entry.group ?? entry.category;
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }
    const weight = (entry: Datum) => entry.value! / maximum;
    partition(
      [...groups],
      { x: 10, y: 12, w: 620, h: 272 },
      ([, data]) => data.reduce((sum, entry) => sum + weight(entry), 0),
      ([group, data], tile) => {
        const color = palette[[...groups.keys()].indexOf(group) % palette.length];
        const titled = data[0].group !== undefined && tile.h > 44 && tile.w > 80;
        if (titled) {
          rect({ ...tile, h: 18, w: tile.w - 2 }, color, group);
          text({ x: tile.x + 4, y: tile.y, w: tile.w - 8, h: 17 }, group, 'FFFFFF', 'start');
        }
        const box = titled ? { ...tile, y: tile.y + 19, h: tile.h - 19 } : tile;
        partition(data, box, weight, (entry, cell) => {
          rect(
            { ...cell, w: cell.w - 2, h: cell.h - 2 },
            color,
            `${group} · ${entry.category}: ${format(entry.value!)}`
          );
          text(
            { x: cell.x + 4, y: cell.y + 2, w: cell.w - 10, h: Math.min(21, cell.h - 4) },
            `${entry.category} · ${compact(entry.value!)}`,
            'FFFFFF',
            'start'
          );
        });
      }
    );
  } else if (type === 'funnel') {
    const max = Math.max(...entries.map(entry => entry.value ?? 0));
    const step = 258 / entries.length;
    entries.forEach((entry, index) => {
      const y = 20 + index * step;
      const bar = 355 * ((entry.value ?? 0) / max);
      rect({ x: 276 - bar / 2, y, w: bar, h: step - 4 }, palette[index % palette.length], entry.category);
      text(
        { x: 466, y: y + (step - 20) / 2, w: 154, h: 20 },
        `${entry.category} · ${entry.value === null ? '—' : format(entry.value)}`,
        ink,
        'start'
      );
    });
  } else if (gauge) {
    const { value, max, percent, target } = gauge;
    const y = 132;
    const spans = percent
      ? [
          { from: 0, to: 70, color: 'A94635' },
          { from: 70, to: 90, color: '936311' },
          { from: 90, to: 100, color: '246647' }
        ]
      : [{ from: 0, to: max, color: empty }];
    const pos = (number: number) => 46 + 548 * (number / max);
    for (const span of spans) rect({ x: pos(span.from), y, w: pos(span.to) - pos(span.from), h: 32 }, span.color);
    if (!percent) rect({ x: pos(0), y, w: pos(value) - pos(0), h: 32 }, palette[0]);
    if (percent) rect({ x: pos(value) - 2, y: y - 7, w: 4, h: 46 }, ink);
    if (target !== undefined) rect({ x: pos(target) - 2, y: y - 10, w: 4, h: 52 }, percent ? 'D3E7F7' : ink);
    text({ x: 32, y: 63, w: 576, h: 38 }, format(value) + (percent ? ' %' : ''));
    text({ x: 32, y: 175, w: 80, h: 20 }, '0');
    text({ x: 528, y: 175, w: 80, h: 20 }, compact(max) + (percent ? ' %' : ''));
    if (target !== undefined)
      text(
        { x: 32, y: 208, w: 576, h: 23 },
        t('Objectif : {{value}}', { value: format(target) + (percent ? ' %' : '') })
      );
  }
  return { width, height, marks };
}
