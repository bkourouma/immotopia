import PptxGenJS from 'pptxgenjs';
import { currentLanguage, t } from '../../i18n';
import { AppError } from '../../middleware/error-middleware';
import type { CopilotArtifact } from './contracts';
import { chartColors, chartExportData } from './artifact-chart-data';
import { artifactColumnGroups, artifactExportSections, artifactProvenanceLines } from './artifact-pdf';

export async function buildArtifactPowerPoint(artifact: CopilotArtifact): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = artifact.title;
  pptx.author = 'ImmoTopia';
  const rtl = currentLanguage() === 'ar';
  pptx.rtlMode = rtl;
  const align = rtl ? 'right' : 'left';

  let slideCount = 0;
  function slide(title: string) {
    if (++slideCount > 150) throw new AppError(t('Ce résultat est trop volumineux pour un export PowerPoint.'), 413);
    const page = pptx.addSlide();
    page.addText(title, {
      x: 0.5,
      y: 0.32,
      w: 12.3,
      h: 0.7,
      fontFace: 'Arial',
      fontSize: 23,
      bold: true,
      color: '19334F',
      align,
      rtlMode: rtl,
      fit: 'shrink'
    });
    return page;
  }

  function narrative(title: string, text: string) {
    // Keep the original text in editable text boxes and give long sections additional slides.
    const parts = text.match(/[\s\S]{1,1250}/gu) ?? [''];
    for (const part of parts) {
      slide(title).addText(part, {
        x: 0.55,
        y: 1.2,
        w: 12.2,
        h: 5.8,
        fontFace: 'Arial',
        fontSize: 17,
        color: '182434',
        align,
        rtlMode: rtl,
        valign: 'top',
        fit: 'shrink',
        breakLine: false
      });
    }
  }

  const cover = slide(artifact.title);
  cover.addText(new Date().toISOString(), { x: 0.55, y: 1.25, w: 12.2, h: 0.4, align, fontSize: 12 });
  if (artifact.kind === 'chart') {
    const chart = chartExportData(artifact);
    if (chart.values.length) {
      const page = slide(artifact.title);
      const horizontal = chart.type === 'horizontal_bar';
      const parts = chart.type === 'pie' || chart.type === 'donut';
      const stacked = chart.type === 'stacked_bar' || chart.type === 'stacked_area';
      const nativeType =
        chart.type === 'donut'
          ? 'doughnut'
          : chart.type === 'area' || chart.type === 'stacked_area'
            ? 'area'
            : chart.type === 'line' || chart.type === 'pie'
              ? chart.type
              : 'bar';
      page.addChart(
        pptx.ChartType[nativeType],
        chart.series.map(series => ({
          name: series.name,
          labels: chart.labels,
          // PptxGenJS ignores falsy workbook values. "0" emits a numeric zero in the embedded XML.
          values: series.values.map(value => (value === 0 ? '0' : value))
        })),
        {
          x: 0.55,
          y: 1.15,
          w: 12.2,
          h: 5.6,
          barDir: horizontal ? 'bar' : 'col',
          barGrouping: stacked ? 'stacked' : 'clustered',
          holeSize: 60,
          displayBlanksAs: 'gap',
          catAxisLabelFontSize: 10,
          catAxisLabelFrequency: String(Math.max(1, Math.ceil(chart.labels.length / 14))),
          catAxisLabelPos: 'low',
          valAxisLabelFontSize: 10,
          // The generator writes this OOXML orientation even though its types only list minMax.
          catAxisOrientation: rtl || horizontal ? ('maxMin' as 'minMax') : 'minMax',
          valAxisOrientation: rtl && horizontal ? ('maxMin' as 'minMax') : 'minMax',
          legendPos: 'b',
          showLegend: true,
          chartColors: parts ? chartColors : chartColors.slice(0, chart.series.length)
        }
      );
      if (chart.type === 'donut') {
        const total = chart.values.reduce((sum, value) => sum + value, 0);
        if (Number.isFinite(total)) {
          page.addText(new Intl.NumberFormat(currentLanguage(), { maximumFractionDigits: 2 }).format(total), {
            x: 4.65,
            y: 3.65,
            w: 4.03,
            h: 0.45,
            align: 'center',
            fontSize: 20,
            bold: true,
            color: '19334F'
          });
        }
      }
      if (chart.fallback)
        page.addText(t('Les données sont présentées en barres pour faciliter leur lecture.'), {
          x: 0.55,
          y: 6.87,
          w: 12.2,
          h: 0.25,
          align,
          rtlMode: rtl,
          fontSize: 10
        });
    } else narrative(artifact.title, t('Aucune valeur numérique à tracer.'));
  }
  for (const section of artifactExportSections(artifact)) {
    if (section.kind === 'text') {
      narrative(artifact.title, section.text);
      continue;
    }
    const title = section.title ?? artifact.title;
    for (const columns of artifactColumnGroups(section.headers.length, section.dimensionColumns)) {
      const order = rtl ? [...columns].reverse() : columns;
      const headers = order.map(index => ({
        text: section.headers[index],
        options: { bold: true, fill: { color: 'E9EFF5' }, color: '19334F' }
      }));
      const maxChars = Math.floor(96 / columns.length);
      const rows = section.rows.flatMap((row, index) => {
        const total = !!section.hasTotals && index === section.rows.length - 1;
        const chunks = order.map(index => {
          const value = String(row[index] ?? '—')
            .replace(/\s+/g, ' ')
            .trim();
          const chars = Array.from(value);
          const parts: string[] = [];
          for (let start = 0; start < chars.length; start += maxChars) {
            parts.push(chars.slice(start, start + maxChars).join(''));
          }
          return parts;
        });
        return Array.from({ length: Math.max(1, ...chunks.map(parts => parts.length)) }, (_, line) =>
          chunks.map(parts => ({ text: parts[line] ?? '', ...(total ? { options: { bold: true } } : {}) }))
        );
      });
      for (let start = 0; start < Math.max(1, rows.length); start += 18) {
        slide(title).addTable([headers, ...rows.slice(start, start + 18)], {
          x: 0.5,
          y: 1.16,
          w: 12.3,
          fontFace: 'Arial',
          fontSize: 11,
          align,
          margin: 4,
          rowH: 0.29,
          border: { type: 'solid', pt: 0.5, color: 'D9E1E9' },
          autoPage: false
        });
      }
    }
    const notes = section.provenance ? artifactProvenanceLines(section.provenance) : [];
    if (section.truncated) notes.unshift(t('Résultat tronqué : seules les premières lignes sont affichées.'));
    if (notes.length) narrative(t('Source des données'), notes.join('\n'));
  }

  const bytes = await pptx.write({ outputType: 'nodebuffer' });
  if (!Buffer.isBuffer(bytes)) throw new Error('Invalid PowerPoint output');
  return bytes;
}
