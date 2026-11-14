import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { t, currentLanguage } from '../../i18n';
import { AppError } from '../../middleware/error-middleware';
import { wrapArabicText } from '../documents/pdf-arabic';
import { embedUnicodeFonts, TextFace } from '../signature/seal-text';
import { chartExportData } from './artifact-chart-data';
import { chartHeight, drawArtifactChart } from './artifact-chart-pdf';
import type { ArtifactCell, ArtifactProvenance, CopilotArtifact } from './contracts';

const margin = 42;
const pageSize: [number, number] = [842, 595];
const width = pageSize[0] - 2 * margin;
const ink = rgb(0.1, 0.15, 0.22);
const blue = rgb(0.13, 0.25, 0.41);
const pale = rgb(0.94, 0.96, 0.98);
const lineHeight = 13;

function formatExportDate(date: Date): string {
  if (!Number.isFinite(date.getTime())) return '—';
  return (
    new Intl.DateTimeFormat(currentLanguage(), {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC'
    }).format(date) + ' UTC'
  );
}

type ExportSection =
  | { kind: 'text'; text: string }
  | {
      kind: 'grid';
      title?: string;
      headers: string[];
      rows: ArtifactCell[][];
      provenance?: ArtifactProvenance;
      truncated?: boolean;
    };

export function artifactExportSections(artifact: CopilotArtifact): ExportSection[] {
  switch (artifact.kind) {
    case 'markdown':
      return [{ kind: 'text', text: artifact.content }];
    case 'document':
      return artifact.blocks.flatMap(block => {
        if (block.kind === 'text') return [{ kind: 'text' as const, text: block.content }];
        return artifactExportSections(block.table).map(section =>
          section.kind === 'grid' ? { ...section, title: block.table.title } : section
        );
      });
    case 'table':
      return [
        {
          kind: 'grid',
          headers: artifact.columns.map(column => column.label),
          truncated: artifact.truncated,
          rows: artifact.rows.map(row => artifact.columns.map(column => row[column.key] ?? null)),
          provenance: artifact.provenance
        }
      ];
    case 'chart':
      return [
        {
          kind: 'grid',
          headers: [artifact.xKey, ...artifact.series.map(series => series.label)],
          rows: artifact.data.map(row => [
            row[artifact.xKey] ?? null,
            ...artifact.series.map(series => row[series.key] ?? null)
          ]),
          provenance: artifact.provenance
        }
      ];
    case 'indicators':
      return [
        {
          kind: 'grid',
          headers: [
            t('Indicateur'),
            t('Valeur'),
            t('Devise'),
            t('Comparaison'),
            t('Valeur de référence'),
            t('Variation (%)')
          ],
          rows: artifact.cards.map(card => [
            card.label,
            card.value,
            card.currency ?? null,
            card.comparison?.label ?? null,
            card.comparison?.value ?? null,
            card.comparison?.change === undefined ? null : Number(card.comparison.change.toFixed(2))
          ]),
          provenance: artifact.provenance
        }
      ];
  }
}

function formatPeriod(period: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return period;
  const date = new Date(`${period}-01T00:00:00Z`);
  return new Intl.DateTimeFormat(currentLanguage(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function artifactProvenanceLines(provenance: ArtifactProvenance): string[] {
  return [
    `${t('Source des données')} — ${provenance.source}`,
    `${t('Période')} — ${formatPeriod(provenance.period)}`,
    `${t('Date de calcul')} — ${formatExportDate(new Date(provenance.calculatedAt))}`,
    ...provenance.rules
  ];
}

export async function buildArtifactPdf(artifact: CopilotArtifact, exportedAt = new Date()): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const rtl = currentLanguage() === 'ar';
  const unicode = await embedUnicodeFonts(pdf);
  if (rtl && !unicode) throw new Error('Police arabe indisponible pour le PDF');
  const direction = rtl ? 'rtl' : 'ltr';
  const regular = new TextFace(await pdf.embedFont(StandardFonts.Helvetica), unicode?.regular ?? null, direction);
  const bold = new TextFace(await pdf.embedFont(StandardFonts.HelveticaBold), unicode?.bold ?? null, direction);
  pdf.setTitle(artifact.title);
  pdf.setCreator('ImmoTopia');
  pdf.setCreationDate(exportedAt);
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  function reserve(height: number) {
    if (y - height >= margin) return false;
    if (pdf.getPageCount() >= 100) throw new AppError(t('Ce résultat est trop volumineux pour un export PDF.'), 413);
    page = pdf.addPage(pageSize);
    y = pageSize[1] - margin;
    return true;
  }

  function textLine(text: string, face: TextFace, size: number, left = margin, right = margin + width, baseline = y) {
    face.draw(page, text, {
      x: rtl ? right - face.width(text, size) : left,
      y: baseline,
      size,
      color: ink
    });
  }

  function paragraph(text: string, face = regular, size = 10) {
    for (const line of wrapArabicText(face, text, size, width)) {
      reserve(size + 4);
      textLine(line, face, size);
      y -= size + 4;
    }
  }

  function grid(headers: string[], rows: ArtifactCell[][]) {
    // Repartir les tableaux larges et répéter la première colonne pour identifier chaque ligne.
    const groups: number[][] = [];
    for (let start = 1; start < headers.length; start += 5) {
      groups.push([0, ...headers.slice(start, start + 5).map((_header, offset) => start + offset)]);
    }
    if (headers.length === 1) groups.push([0]);
    for (const columns of groups) {
      const cellWidth = width / columns.length;
      const wrap = (values: ArtifactCell[], face: TextFace) =>
        columns.map(index => wrapArabicText(face, String(values[index] ?? '—'), 9, cellWidth - 12));
      const header = wrap(headers, bold).map(lines =>
        lines.length > 4 ? [...lines.slice(0, 3), lines[3] + '…'] : lines
      );
      const height = (cells: string[][]) => Math.max(...cells.map(cell => cell.length)) * lineHeight + 8;
      function draw(cells: string[][], face: TextFace, background: boolean) {
        const rowHeight = height(cells);
        if (background) page.drawRectangle({ x: margin, y: y - rowHeight, width, height: rowHeight, color: pale });
        cells.forEach((lines, index) => {
          const x = margin + (rtl ? cells.length - index - 1 : index) * cellWidth;
          lines.forEach((line, row) => textLine(line, face, 9, x + 6, x + cellWidth - 6, y - 12 - row * lineHeight));
        });
        y -= rowHeight;
        page.drawLine({ start: { x: margin, y }, end: { x: margin + width, y }, color: pale, thickness: 0.5 });
      }
      reserve(height(header) + lineHeight + 8);
      draw(header, bold, true);
      for (const values of rows) {
        const cells = wrap(values, regular);
        let row = cells;
        // Conserver les cellules longues en continuant sur la page suivante.
        while (row.some(lines => lines.length)) {
          if (reserve(lineHeight + 8)) draw(header, bold, true);
          const available = Math.max(1, Math.floor((y - margin - 8) / lineHeight));
          draw(
            row.map(lines => lines.slice(0, available)),
            regular,
            false
          );
          row = row.map(lines => lines.slice(available));
        }
      }
      y -= 14;
    }
  }

  paragraph(artifact.title, bold, 21);
  paragraph(formatExportDate(exportedAt), regular, 9);
  y -= 12;
  if (artifact.kind === 'chart') {
    const chart = chartExportData(artifact);
    if (chart.values.length) {
      if (chart.fallback)
        paragraph(t('Les données sont présentées en barres pour faciliter leur lecture.'), regular, 9);
      reserve(chartHeight);
      drawArtifactChart(page, chart, regular, { left: margin, width, top: y, rtl });
      y -= chartHeight;
    } else paragraph(t('Aucune valeur numérique à tracer.'), regular, 10);
  }
  for (const section of artifactExportSections(artifact)) {
    if (section.kind === 'text') {
      for (const line of section.text.split(/\r?\n/)) {
        const heading = /^#{1,6}\s+/.test(line);
        paragraph(
          line.replace(/^#{1,6}\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1'),
          heading ? bold : regular,
          heading ? 13 : 10
        );
      }
    } else {
      if (section.title) paragraph(section.title, bold, 13);
      grid(section.headers, section.rows);
      if (section.truncated) paragraph(t('Résultat tronqué : seules les premières lignes sont affichées.'), bold, 9);
      if (section.provenance)
        for (const line of artifactProvenanceLines(section.provenance)) paragraph(line, regular, 9);
    }
    y -= 10;
  }

  pdf.getPages().forEach((sheet, index, pages) => {
    sheet.drawLine({ start: { x: margin, y: 30 }, end: { x: margin + width, y: 30 }, thickness: 0.6, color: pale });
    regular
      .withDirection('ltr')
      .draw(sheet, `ImmoTopia  ·  ${index + 1} / ${pages.length}`, { x: margin, y: 17, size: 8, color: blue });
  });
  return Buffer.from(await pdf.save());
}
