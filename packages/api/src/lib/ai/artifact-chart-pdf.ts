import { rgb, type PDFPage } from 'pdf-lib';
import { currentAssistantLanguage } from '../../i18n';
import { withPdfEllipsis, wrapArabicText } from '../documents/pdf-arabic';
import type { TextFace } from '../signature/seal-text';
import { chartColors, type chartExportData } from './artifact-chart-data';
import type { ChartScene } from './contracts';

type Chart = ReturnType<typeof chartExportData>;
const palette = chartColors.map(hex =>
  rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4), 16) / 255)
);
const ink = rgb(0.1, 0.15, 0.22);
const grid = rgb(0.83, 0.87, 0.92);

export const chartHeight = 300;

export function drawChartScene(
  page: PDFPage,
  scene: ChartScene,
  font: TextFace,
  area: { left: number; width: number; top: number; rtl: boolean }
) {
  const ratio = area.width / scene.width;
  for (const mark of scene.marks) {
    const left = area.left + (area.rtl ? scene.width - mark.x - mark.w : mark.x) * ratio;
    const top = area.top - mark.y * ratio;
    const w = mark.w * ratio;
    const h = mark.h * ratio;
    const color = rgb(
      ...([0, 2, 4].map(offset => parseInt(mark.color.slice(offset, offset + 2), 16) / 255) as [number, number, number])
    );
    if (mark.kind === 'rect') {
      page.drawRectangle({ x: left, y: top - h, width: w, height: h, color });
    } else {
      const size = Math.min(22 * ratio, h * 0.8);
      const lines = wrapArabicText(font, mark.text, size, w);
      const label = lines.length > 1 ? withPdfEllipsis(font, lines[0], size, w) : (lines[0] ?? '');
      const remaining = Math.max(0, w - font.width(label, size));
      const pos =
        mark.align === 'center' || !mark.align ? remaining / 2 : (mark.align === 'start') === area.rtl ? remaining : 0;
      font.draw(page, label, { x: left + pos, y: top - h / 2 - size * 0.3, size, color });
    }
  }
}

function numericScale(values: number[], includeZero: boolean) {
  const magnitude = Math.max(1, ...values.map(Math.abs));
  const scaled = values.map(value => value / magnitude);
  if (includeZero || !scaled.length) scaled.push(0);
  const low = Math.min(...scaled);
  const high = Math.max(...scaled);
  const span = high - low;
  return {
    at: (value: number) => (span ? (value / magnitude - low) / span : 0.5),
    tick: (index: number) => (low + (span * index) / 4) * magnitude,
    count: span ? 5 : 1
  };
}

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
    const label = lines.length > 1 ? withPdfEllipsis(font, lines[0], size, maxWidth - 9) : (lines[0] ?? '');
    if (!label) return;
    const w = font.width(label, size);
    const offset = align === 'center' ? w / 2 : (align === 'start') === rtl ? w : 0;
    font.draw(page, label, { x: x(at) - offset, y, size, color: ink });
  };
  const square = (at: number, y: number, index: number) =>
    page.drawRectangle({ x: x(at) - (rtl ? 8 : 0), y, width: 8, height: 8, color: palette[index % palette.length] });

  const number = new Intl.NumberFormat(currentAssistantLanguage(), { notation: 'compact', maximumFractionDigits: 2 });
  if (chart.type === 'scatter') {
    const points = chart.xValues.flatMap((abscissa, index) => {
      const ordinate = chart.series[0].values[index];
      return abscissa === null || ordinate === null ? [] : [{ abscissa, ordinate }];
    });
    if (!points.length) return;
    const sx = numericScale(
      points.map(point => point.abscissa),
      false
    );
    const sy = numericScale(
      points.map(point => point.ordinate),
      false
    );
    const start = 65;
    const plotWidth = width - start - 24;
    const bottom = top - 228;
    const height = 185;
    const valueX = (value: number) => start + sx.at(value) * plotWidth;
    const valueY = (value: number) => bottom + sy.at(value) * height;
    for (let index = 0; index < sx.count; index++) {
      const value = sx.tick(index);
      const at = valueX(value);
      page.drawLine({
        start: { x: x(at), y: bottom },
        end: { x: x(at), y: bottom + height },
        color: grid,
        thickness: 0.6
      });
      text(number.format(value), at, bottom - 16, plotWidth / 5, 'center');
    }
    for (let index = 0; index < sy.count; index++) {
      const value = sy.tick(index);
      const at = valueY(value);
      page.drawLine({
        start: { x: x(start), y: at },
        end: { x: x(start + plotWidth), y: at },
        color: grid,
        thickness: 0.6
      });
      text(number.format(value), start - 6, at - 3, start - 5, 'end');
    }
    for (const point of points) {
      page.drawCircle({ x: x(valueX(point.abscissa)), y: valueY(point.ordinate), size: 3, color: palette[0] });
    }
    text(chart.xLabel, start + plotWidth / 2, bottom - 34, plotWidth, 'center');
    square(start, top - 19, 0);
    text(chart.series[0].name, start + 14, top - 19, plotWidth - 14, 'start');
    return;
  }

  if (chart.type === 'pie' || chart.type === 'donut') {
    const cx = x(width * 0.3);
    const cy = top - 133;
    const radius = 104;
    const values = chart.series[0].values;
    const max = Math.max(...chart.values);
    const total = chart.values.reduce((sum, value) => sum + value / max, 0);
    let angle = -Math.PI / 2;
    const percent = new Intl.NumberFormat(currentAssistantLanguage(), { style: 'percent', maximumFractionDigits: 1 });
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
    if (chart.type === 'donut') {
      page.drawCircle({ x: cx, y: cy, size: radius * 0.6, color: rgb(1, 1, 1) });
      const amount = chart.values.reduce((sum, value) => sum + value, 0);
      if (Number.isFinite(amount)) {
        text(
          new Intl.NumberFormat(currentAssistantLanguage(), { notation: 'compact', maximumFractionDigits: 2 }).format(
            amount
          ),
          width * 0.3,
          cy - 3,
          radius,
          'center'
        );
      }
    }
    return;
  }

  // Normalize before subtracting so that even very large finite currency values cannot overflow the scale.
  const secondary = chart.type === 'combo' && chart.series.some(series => series.axis === 'secondary');
  const primaryValues = secondary
    ? chart.series
        .filter(series => series.axis !== 'secondary')
        .flatMap(series => series.values.filter(value => value !== null))
    : chart.values;
  const secondaryScale = numericScale(
    (secondary ? chart.series.filter(series => series.axis === 'secondary') : []).flatMap(series =>
      series.values.filter(value => value !== null)
    ),
    true
  );
  const magnitude = Math.max(1, ...primaryValues.map(Math.abs));
  const stacked = chart.type === 'stacked_bar' || chart.type === 'stacked_area';
  const horizontal = chart.type === 'horizontal_bar';
  const areaChart = chart.type === 'area' || chart.type === 'stacked_area';
  const positive = chart.labels.map(() => 0);
  const negative = chart.labels.map(() => 0);
  const ranges = chart.series.map(series =>
    series.values.map((value, category) => {
      if (value === null) return null;
      if (secondary && series.axis === 'secondary') return { base: 0, end: value };
      const normalized = value / magnitude;
      const totals = normalized < 0 ? negative : positive;
      const base = stacked ? totals[category] : 0;
      const end = base + normalized;
      if (stacked) totals[category] = end;
      return { base, end };
    })
  );
  const lo = Math.min(0, ...(stacked ? negative : primaryValues.map(value => value / magnitude)));
  const hi = Math.max(0, ...(stacked ? positive : primaryValues.map(value => value / magnitude)));
  const low = lo;
  const high = lo === hi ? 1 / magnitude : hi;
  const bottom = top - 239;
  const plotHeight = 199;
  const scale = (value: number) => (value - low) / (high - low);
  const y = (value: number) => bottom + plotHeight * scale(value);
  const offset = horizontal ? width * 0.24 : 67;
  const plotWidth = width - offset - (secondary ? 67 : 15);
  const step = (horizontal ? plotHeight : plotWidth) / chart.labels.length;
  const valueX = (value: number) => x(offset + plotWidth * scale(value));
  for (let index = 0; index <= 4; index++) {
    const tick = low + ((high - low) * index) / 4;
    const baseline = y(tick);
    const at = valueX(tick);
    const zero = tick === 0;
    page.drawLine({
      start: horizontal ? { x: at, y: bottom } : { x: x(offset), y: baseline },
      end: horizontal ? { x: at, y: bottom + plotHeight } : { x: x(offset + plotWidth), y: baseline },
      color: zero ? ink : grid,
      thickness: 0.6
    });
    text(
      number.format(tick * magnitude),
      horizontal ? offset + plotWidth * scale(tick) : offset - 7,
      horizontal ? bottom - 16 : baseline - 3,
      horizontal ? plotWidth / 4 : offset - 9,
      horizontal ? 'center' : 'end'
    );
  }
  if (secondary) {
    for (let index = 0; index < secondaryScale.count; index++) {
      const value = secondaryScale.tick(index);
      text(
        number.format(value),
        offset + plotWidth + 8,
        bottom + plotHeight * secondaryScale.at(value) - 3,
        60,
        'start'
      );
    }
  }
  page.drawLine({
    start: horizontal ? { x: valueX(0), y: bottom } : { x: x(offset), y: y(0) },
    end: horizontal ? { x: valueX(0), y: bottom + plotHeight } : { x: x(offset + plotWidth), y: y(0) },
    color: ink,
    thickness: 0.65
  });
  const frequency = Math.max(1, Math.ceil(chart.labels.length / (horizontal ? 15 : 10)));
  chart.labels.forEach((label, index) => {
    if (index % frequency !== 0) return;
    if (horizontal) text(label, offset - 8, bottom + plotHeight - step * (index + 0.5) - 3, offset - 8, 'end');
    else text(label, offset + step * (index + 0.5), bottom - 16, step * frequency, 'center');
  });
  const barSeries = chart.series.filter(series => series.form !== 'line');
  const barWidth = Math.min(30, (step * 0.72) / (stacked ? 1 : Math.max(1, barSeries.length)));
  const legendWidth = width / chart.series.length;
  for (const [index, series] of chart.series.entries()) {
    const color = palette[index % palette.length];
    const legendAt = index * legendWidth + 6;
    square(legendAt, top - 16, index);
    text(series.name, legendAt + 14, top - 16, legendWidth - 18, 'start');
    let previous: { x: number; y: number } | undefined;
    const ordinate =
      secondary && series.axis === 'secondary' ? (value: number) => bottom + plotHeight * secondaryScale.at(value) : y;
    let areaPoints: { x: number; y: number; base: number }[] = [];
    function drawArea() {
      if (areaPoints.length > 1) {
        const coords = (point: { x: number; y: number }) => `${point.x.toFixed(3)} ${(-point.y).toFixed(3)}`;
        const topEdge = areaPoints.map(coords);
        const baseEdge = [...areaPoints].reverse().map(point => coords({ x: point.x, y: point.base }));
        page.drawSvgPath(`M ${[...topEdge, ...baseEdge].join(' L ')} Z`, { x: 0, y: 0, color, opacity: 0.27 });
      }
      areaPoints = [];
    }
    ranges[index].forEach((value, category) => {
      if (value === null) {
        previous = undefined;
        if (areaChart) drawArea();
        return;
      }
      const center = offset + step * (category + 0.5);
      const point = { x: x(center), y: ordinate(value.end) };
      if (chart.type === 'line' || (chart.type === 'combo' && series.form === 'line')) {
        if (previous) page.drawLine({ start: previous, end: point, color, thickness: 1.5 });
        page.drawCircle({ ...point, size: chart.labels.length <= 24 ? 2.1 : 0.9, color });
        previous = point;
      } else if (areaChart) {
        areaPoints.push({ ...point, base: y(value.base) });
        if (previous) page.drawLine({ start: previous, end: point, color, thickness: 1.5 });
        else page.drawCircle({ ...point, size: 1.7, color });
        previous = point;
      } else if (horizontal) {
        const at = bottom + plotHeight - step * (category + 0.5) - (index - (chart.series.length - 1) / 2) * barWidth;
        const ends = [valueX(value.base), valueX(value.end)];
        page.drawRectangle({
          x: Math.min(...ends),
          y: at - barWidth * 0.44,
          width: Math.abs(ends[0] - ends[1]),
          height: barWidth * 0.88,
          color
        });
      } else {
        const at = x(center + (stacked ? 0 : (barSeries.indexOf(series) - (barSeries.length - 1) / 2) * barWidth));
        const base = ordinate(value.base);
        page.drawRectangle({
          x: at - barWidth * 0.44,
          y: Math.min(base, point.y),
          width: barWidth * 0.88,
          height: Math.abs(point.y - base),
          color
        });
      }
    });
    if (areaChart) drawArea();
  }
}
