import type { CopilotArtifact } from '../types/copilot';
import { exportableTable, neutralizeFormula, safeFilename, toCsv } from './copilot-artifact';
import { saveBlob } from './save-blob';

/**
 * Téléchargements d'artefacts, côté navigateur, à partir des données reçues.
 * `exceljs` est chargé à la demande : il ne doit jamais entrer dans le bundle
 * d'entrée.
 */

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function downloadCsv(artifact: CopilotArtifact): void {
  const data = exportableTable(artifact);
  if (!data) return;
  const csv = toCsv(data.columns, data.rows);
  // BOM : Excel lit alors correctement l'UTF-8 (accents, arabe).
  saveBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), `${safeFilename(artifact.title)}.csv`);
}

export async function downloadXlsx(artifact: CopilotArtifact): Promise<void> {
  const data = exportableTable(artifact);
  if (!data) return;
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(safeFilename(artifact.title, 'Feuille1').slice(0, 31));
  sheet.addRow(data.columns.map(c => neutralizeFormula(c.label)));
  sheet.getRow(1).font = { bold: true };
  for (const row of data.rows) {
    sheet.addRow(
      data.columns.map(c => {
        const v = row[c.key] ?? null;
        return typeof v === 'string' ? neutralizeFormula(v) : v;
      })
    );
  }
  data.columns.forEach((c, i) => {
    sheet.getColumn(i + 1).width = Math.min(Math.max(c.label.length + 2, 12), 50);
  });
  const buffer = await workbook.xlsx.writeBuffer();
  saveBlob(new Blob([buffer], { type: XLSX_TYPE }), `${safeFilename(artifact.title)}.xlsx`);
}

export function downloadMarkdown(artifact: CopilotArtifact): void {
  if (artifact.kind !== 'markdown') return;
  saveBlob(new Blob([artifact.content], { type: 'text/markdown;charset=utf-8' }), `${safeFilename(artifact.title)}.md`);
}

/**
 * Le SVG du graphique : celui du conteneur `.recharts-wrapper`, sinon le plus grand
 * `svg.recharts-surface`. Les icônes de la légende (14×14) sont aussi des
 * `recharts-surface` : prendre « le premier » exportait un carré de couleur.
 */
export function findChartSvg(container: ParentNode | null): SVGSVGElement | null {
  if (!container) return null;
  const direct = container.querySelector<SVGSVGElement>('.recharts-wrapper > svg.recharts-surface');
  if (direct) return direct;
  const all = Array.from(container.querySelectorAll<SVGSVGElement>('svg.recharts-surface'));
  const area = (svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    return (r.width || Number(svg.getAttribute('width')) || 0) * (r.height || Number(svg.getAttribute('height')) || 0);
  };
  return all.sort((a, b) => area(b) - area(a))[0] ?? null;
}

/** Fond effectif d'un élément (premier ancêtre non transparent), blanc à défaut. */
function resolvedBackground(el: Element): string {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color && color !== 'transparent' && !/^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(color)) return color;
  }
  return '#ffffff';
}

/**
 * Fige sur chaque texte du clone la police et la couleur résolues : une fois le SVG
 * chargé comme image, la feuille de style de la page ne s'applique plus.
 */
function inlineTextStyles(source: SVGSVGElement, clone: SVGSVGElement): void {
  const from = source.querySelectorAll('text, tspan');
  const to = clone.querySelectorAll('text, tspan');
  from.forEach((node, i) => {
    const target = to[i];
    if (!target) return;
    const cs = getComputedStyle(node);
    target.setAttribute('font-family', cs.fontFamily);
    target.setAttribute('font-size', cs.fontSize);
    if (!target.getAttribute('fill') && cs.fill && cs.fill !== 'none') target.setAttribute('fill', cs.fill);
  });
}

interface LegendEntry {
  label: string;
  color: string;
}

/** La légende de recharts est du HTML, hors du SVG : on la relit pour la redessiner sous le graphique. */
function readLegend(container: ParentNode): LegendEntry[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.recharts-legend-item')).map(item => {
    // Premier aplat ou trait réellement coloré de l'icône (les blancs et « none » sont des détails du dessin).
    const marks = Array.from(item.querySelectorAll<SVGElement>('[fill], [stroke]')).flatMap(el => [
      el.getAttribute('fill'),
      el.getAttribute('stroke')
    ]);
    const color = marks.find(v => v && !/^(none|#fff|#ffffff|white|transparent)$/i.test(v)) ?? '#525252';
    return { label: (item.textContent ?? '').trim(), color };
  });
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  entries: LegendEntry[],
  top: number,
  width: number,
  scale: number,
  textColor: string,
  fontFamily: string
): void {
  const size = 12 * scale;
  ctx.font = `${size}px ${fontFamily}`;
  ctx.textBaseline = 'middle';
  const gap = 16 * scale;
  const swatch = 10 * scale;
  const widths = entries.map(e => swatch + 6 * scale + ctx.measureText(e.label).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, entries.length - 1);
  let x = Math.max(8 * scale, (width - total) / 2);
  const y = top + (LEGEND_HEIGHT * scale) / 2;
  entries.forEach((entry, i) => {
    ctx.fillStyle = entry.color;
    ctx.fillRect(x, y - swatch / 2, swatch, swatch);
    ctx.fillStyle = textColor;
    ctx.fillText(entry.label, x + swatch + 6 * scale, y);
    x += widths[i] + gap;
  });
}

const LEGEND_HEIGHT = 28;

/**
 * Sérialise le SVG recharts d'un conteneur vers un PNG (canvas) et le télécharge :
 * fond opaque (celui du thème), polices et couleurs figées, définition double de
 * l'affichage, légende redessinée sous le graphique.
 */
export async function downloadChartPng(container: HTMLElement | null, title: string): Promise<void> {
  const svg = findChartSvg(container);
  if (!svg || !container) throw new Error('chart-svg-missing');
  const rect = svg.getBoundingClientRect();
  const width = Math.max(Math.round(rect.width || Number(svg.getAttribute('width')) || 0), 1);
  const height = Math.max(Math.round(rect.height || Number(svg.getAttribute('height')) || 0), 1);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  inlineTextStyles(svg, clone);
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('chart-svg-load'));
      img.src = url;
    });
    const scale = 2;
    const legend = readLegend(container);
    const legendHeight = legend.length > 0 ? LEGEND_HEIGHT : 0;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = (height + legendHeight) * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas-unavailable');
    ctx.fillStyle = resolvedBackground(svg);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, width * scale, height * scale);
    if (legend.length > 0) {
      const cs = getComputedStyle(svg);
      drawLegend(
        ctx,
        legend,
        height * scale,
        canvas.width,
        scale,
        cs.color || '#525252',
        cs.fontFamily || 'sans-serif'
      );
    }
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas-blob'))), 'image/png')
    );
    saveBlob(blob, `${safeFilename(title)}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
