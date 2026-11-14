import PptxGenJS from 'pptxgenjs';
import { currentLanguage, t } from '../../i18n';
import { AppError } from '../../middleware/error-middleware';
import type { CopilotArtifact } from './contracts';
import { artifactExportSections, artifactProvenanceLines } from './artifact-pdf';

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
  for (const section of artifactExportSections(artifact)) {
    if (section.kind === 'text') {
      narrative(artifact.title, section.text);
      continue;
    }
    const title = section.title ?? artifact.title;
    const groups: number[][] = [];
    for (let start = 1; start < section.headers.length; start += 5) {
      groups.push([0, ...section.headers.slice(start, start + 5).map((_label, offset) => start + offset)]);
    }
    if (section.headers.length === 1) groups.push([0]);
    for (const columns of groups) {
      const order = rtl ? [...columns].reverse() : columns;
      const headers = order.map(index => ({
        text: section.headers[index],
        options: { bold: true, fill: { color: 'E9EFF5' }, color: '19334F' }
      }));
      const maxChars = Math.floor(96 / columns.length);
      const rows = section.rows.flatMap(row => {
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
          chunks.map(parts => ({ text: parts[line] ?? '' }))
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
