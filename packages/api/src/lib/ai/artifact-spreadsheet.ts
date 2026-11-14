import { Workbook } from 'exceljs';
import { currentLanguage, t } from '../../i18n';
import { AppError } from '../../middleware/error-middleware';
import { artifactExportSections, artifactProvenanceLines } from './artifact-pdf';
import type { ArtifactCell, CopilotArtifact } from './contracts';

function neutralize(value: ArtifactCell): ArtifactCell {
  return typeof value === 'string' && /^[\s\uFEFF]*[=+\-@]/u.test(value) ? "'" + value : value;
}

function csvValue(value: ArtifactCell, separator: string): string {
  if (typeof value === 'number') return separator === ';' ? String(value).replace('.', ',') : String(value);
  return '"' + String(neutralize(value) ?? '').replace(/"/g, '""') + '"';
}

export function buildArtifactCsv(artifact: CopilotArtifact): Buffer {
  const sections = artifactExportSections(artifact);
  const grid = sections[0];
  if (sections.length !== 1 || grid?.kind !== 'grid') {
    throw new AppError(t('Ce résultat ne peut pas être exporté en CSV.'), 422);
  }
  const sep = currentLanguage() === 'en' ? ',' : ';';
  const rows: ArtifactCell[][] = [grid.headers, ...grid.rows];
  if (grid.truncated || grid.provenance) {
    rows.push([]);
    if (grid.truncated) rows.push([t('Résultat tronqué : seules les premières lignes sont affichées.')]);
    if (grid.provenance) {
      const provenance = artifactProvenanceLines(grid.provenance);
      rows.push(...provenance.map(line => [line]));
    }
  }
  return Buffer.from('\uFEFF' + rows.map(row => row.map(value => csvValue(value, sep)).join(sep)).join('\r\n'), 'utf8');
}

export async function buildArtifactXlsx(artifact: CopilotArtifact): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'ImmoTopia';
  const rtl = currentLanguage() === 'ar';
  for (const [index, section] of artifactExportSections(artifact).entries()) {
    const sheet = workbook.addWorksheet(String(index + 1), { views: [{ rightToLeft: rtl }] });
    sheet.addRow([section.kind === 'grid' ? (section.title ?? artifact.title) : artifact.title]).font = { bold: true };
    if (section.kind === 'text') {
      for (const line of section.text.split(/\r?\n/)) sheet.addRow([line]);
      sheet.getColumn(1).width = 85;
      continue;
    }
    sheet.addRow(section.headers).font = { bold: true };
    for (const row of section.rows) sheet.addRow(row);
    section.headers.forEach((header, col) => {
      sheet.getColumn(col + 1).width = Math.min(54, Math.max(18, header.length + 4));
    });
    if (section.truncated) sheet.addRow([t('Résultat tronqué : seules les premières lignes sont affichées.')]);
    if (section.provenance) {
      sheet.addRow([]);
      for (const line of artifactProvenanceLines(section.provenance)) sheet.addRow([line]);
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
