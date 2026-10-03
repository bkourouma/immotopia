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

/** Sérialise le SVG recharts d'un conteneur vers un PNG (canvas) et le télécharge. */
export async function downloadChartPng(container: HTMLElement | null, title: string): Promise<void> {
  const svg = container?.querySelector<SVGSVGElement>('svg.recharts-surface');
  if (!svg) throw new Error('chart-svg-missing');
  const rect = svg.getBoundingClientRect();
  const width = Math.max(Math.round(rect.width || Number(svg.getAttribute('width')) || 0), 320);
  const height = Math.max(Math.round(rect.height || Number(svg.getAttribute('height')) || 0), 200);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
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
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas-unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas-blob'))), 'image/png')
    );
    saveBlob(blob, `${safeFilename(title)}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
