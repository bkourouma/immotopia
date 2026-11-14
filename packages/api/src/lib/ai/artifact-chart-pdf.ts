import { rgb, type PDFPage } from 'pdf-lib';
import { currentLanguage } from '../../i18n';
import { wrapArabicText } from '../documents/pdf-arabic';
import type { TextFace } from '../signature/seal-text';
import { chartColors, type chartExportData } from './artifact-chart-data';

type Chart = ReturnType<typeof chartExportData>;
const palette = chartColors.map(hex =>
  rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4), 16) / 255)
);
const ink = rgb(0.1, 0.15, 0.22);
const grid = rgb(0.83, 0.87, 0.92);

export const chartHeight = 300;

export function drawArtifactChart(
  page: PDFPage,
  chart: Chart,
  font: TextFace,
  area: { left: number; width: number; top: number; rtl: boolean }
) {
  const { left, width, top, rtl } = area;
  const x = (n: number) => left + (rtl ? width - n : n);
  const text = (value: string, at: number, y: number, maxWidth: number, align: 'start' | 'center' | 'end') => {
    const size = 9;
    const lines = wrapArabicText(font, value.replace(/\s+/g, ' ').trim(), size, maxWidth - 9);
    const label = lines.length > 1 ? lines[0] + '…' : (lines[0] ?? '');
    if (!label) return;
    const w = font.width(label, size);
    const offset = align === 'center' ? w / 2 : (align === 'start') === rtl ? w : 0;
    font.draw(page, label, { x: x(at) - offset, y, size, color: ink });
  };
  const square = (at: number, y: number, index: number) =>
    page.drawRectangle({ x: x(at) - (rtl ? 8 : 0), y, width: 8, height: 8, color: palette[index % palette.length] });

  if (chart.type === 'pie') {
    const cx = x(width * 0.3);
    const cy = top - 133;
    const radius = 104;
    const values = chart.series[0].values;
    const max = Math.max(...chart.values);
    const total = chart.values.reduce((sum, value) => sum + value / max, 0);
    let angle = -Math.PI / 2;
    const percent = new Intl.NumberFormat(currentLanguage(), { style: 'percent', maximumFractionDigits: 1 });
    values.forEach((value, index) => {
      const portion = (value ?? 0) / max / total;
      if (portion > 0) {
        const color = palette[index % palette.length];
        const end = angle + portion * 2 * Math.PI;
        if (portion >= 1) page.drawCircle({ x: cx, y: cy, size: radius, color });
        else {
          const point = (theta: number) =>
            `${(radius * Math.cos(theta)).toFixed(5)} ${(radius * Math.sin(theta)).toFixed(5)}`;
          page.drawSvgPath(
            `M 0 0 L ${point(angle)} A ${radius} ${radius} 0 ${portion > 0.5 ? 1 : 0} 1 ${point(end)} Z`,
            {
              x: cx,
              y: cy,
              color
            }
          );
        }
        angle = end;
      }
      const row = top - 45 - 22 * index;
      square(width * 0.53, row, index);
      text(chart.labels[index], width * 0.53 + 14, row, width * 0.33, 'start');
      text(value === null ? '—' : percent.format(portion), width - 16, row, 65, 'end');
    });
    return;
  }

  // Normalize before subtracting so that even very large finite currency values cannot overflow the scale.
  const magnitude = Math.max(1, ...chart.values.map(Math.abs));
  const lo = Math.min(0, ...chart.values.map(value => value / magnitude));
  const hi = Math.max(0, ...chart.values.map(value => value / magnitude));
  const low = lo;
  const high = lo === hi ? 1 / magnitude : hi;
  const bottom = top - 239;
  const plotHeight = 199;
  const y = (value: number) => bottom + plotHeight * ((value - low) / (high - low));
  const offset = 67;
  const plotWidth = width - offset - 15;
  const step = plotWidth / chart.labels.length;
  const number = new Intl.NumberFormat(currentLanguage(), { notation: 'compact', maximumFractionDigits: 2 });
  const yZero = y(0);
  for (let index = 0; index <= 4; index++) {
    const tick = low + ((high - low) * index) / 4;
    const baseline = y(tick);
    page.drawLine({
      start: { x: x(offset), y: baseline },
      end: { x: x(offset + plotWidth), y: baseline },
      color: grid,
      thickness: 0.6
    });
    text(number.format(tick * magnitude), offset - 7, baseline - 3, offset - 9, 'end');
  }
  page.drawLine({
    start: { x: x(offset), y: yZero },
    end: { x: x(offset + plotWidth), y: yZero },
    color: ink,
    thickness: 0.65
  });
  const frequency = Math.max(1, Math.ceil(chart.labels.length / 10));
  chart.labels.forEach((label, index) => {
    if (index % frequency === 0) text(label, offset + step * (index + 0.5), bottom - 16, step * frequency, 'center');
  });
  const barWidth = Math.min(30, (step * 0.72) / chart.series.length);
  const legendWidth = width / chart.series.length;
  for (const [index, series] of chart.series.entries()) {
    const color = palette[index % palette.length];
    const legendAt = index * legendWidth + 6;
    square(legendAt, top - 16, index);
    text(series.name, legendAt + 14, top - 16, legendWidth - 18, 'start');
    let previous: { x: number; y: number } | undefined;
    series.values.forEach((value, category) => {
      if (value === null) {
        previous = undefined;
        return;
      }
      const center = offset + step * (category + 0.5);
      const point = { x: x(center), y: y(value / magnitude) };
      if (chart.type === 'line') {
        if (previous) page.drawLine({ start: previous, end: point, color, thickness: 1.5 });
        page.drawCircle({ ...point, size: chart.labels.length <= 24 ? 2.1 : 0.9, color });
        previous = point;
      } else {
        const at = x(center + (index - (chart.series.length - 1) / 2) * barWidth);
        page.drawRectangle({
          x: at - barWidth * 0.44,
          y: Math.min(yZero, point.y),
          width: barWidth * 0.88,
          height: Math.abs(point.y - yZero),
          color
        });
      }
    });
  }
}
