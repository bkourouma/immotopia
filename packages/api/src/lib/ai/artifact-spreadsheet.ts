import { Workbook } from 'exceljs';
import { currentAssistantLanguage, t } from '../../i18n';
import { AppError } from '../../middleware/error-middleware';
import {
  artifactExportContextLines,
  artifactExportSections,
  artifactProvenanceLines,
  type ArtifactExportContext
} from './artifact-pdf';
import type { ArtifactCell, CopilotArtifact } from './contracts';

function neutralize(value: ArtifactCell): ArtifactCell {
  return typeof value === 'string' && /^[\s\uFEFF]*[=+\-@]/u.test(value) ? "'" + value : value;
}

function csvValue(value: ArtifactCell, separator: string): string {
  if (typeof value === 'number') return separator === ';' ? String(value).replace('.', ',') : String(value);
  return '"' + String(neutralize(value) ?? '').replace(/"/g, '""') + '"';
}

export function buildArtifactCsv(
  artifact: CopilotArtifact,
  context: ArtifactExportContext = { exportedAt: new Date() }
): Buffer {
  const sections = artifactExportSections(artifact);
  const grid = sections[0];
  if (sections.length !== 1 || grid?.kind !== 'grid') {
    throw new AppError(t('Ce résultat ne peut pas être exporté en CSV.'), 422);
  }
  const language = currentAssistantLanguage();
  const sep = language === 'fr' || language === 'ar' || language === 'es' ? ';' : ',';
  const rows: ArtifactCell[][] = [grid.headers, ...grid.rows];
  rows.push([]);
  if (grid.truncated) rows.push([t('Résultat tronqué : seules les premières lignes sont affichées.')]);
  for (const note of grid.notes ?? []) rows.push([note]);
  if (grid.provenance) rows.push(...artifactProvenanceLines(grid.provenance).map(line => [line]));
  rows.push(...artifactExportContextLines(context).map(line => [line]));
  return Buffer.from('\uFEFF' + rows.map(row => row.map(value => csvValue(value, sep)).join(sep)).join('\r\n'), 'utf8');
}

export async function buildArtifactXlsx(
  artifact: CopilotArtifact,
  context: ArtifactExportContext = { exportedAt: new Date() }
): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'ImmoTopia';
  workbook.created = context.exportedAt;
  const rtl = currentAssistantLanguage() === 'ar';
  const sections = artifactExportSections(artifact);
  for (const [index, section] of sections.entries()) {
    const sheet = workbook.addWorksheet(String(index + 1), { views: [{ rightToLeft: rtl }] });
    sheet.addRow([section.kind === 'grid' ? (section.title ?? artifact.title) : artifact.title]).font = { bold: true };
    if (section.kind === 'text') {
      for (const line of section.text.split(/\r?\n/)) sheet.addRow([line]);
      sheet.getColumn(1).width = 85;
      continue;
    }
    sheet.addRow(section.headers).font = { bold: true };
    for (const [index, row] of section.rows.entries()) {
      const entry = sheet.addRow(row);
      if (section.hasTotals && index === section.rows.length - 1) entry.font = { bold: true };
    }
    section.headers.forEach((header, col) => {
      sheet.getColumn(col + 1).width = Math.min(54, Math.max(18, header.length + 4));
    });
    if (section.truncated) sheet.addRow([t('Résultat tronqué : seules les premières lignes sont affichées.')]);
    for (const note of section.notes ?? []) sheet.addRow([note]);
    if (section.provenance) {
      sheet.addRow([]);
      for (const line of artifactProvenanceLines(section.provenance)) sheet.addRow([line]);
    }
  }
  const provenance = workbook.addWorksheet(t('Provenance'), { views: [{ rightToLeft: rtl }] });
  provenance.getColumn(1).width = 85;
  for (const line of artifactExportContextLines(context)) provenance.addRow([line]);
  const references = new Set(
    sections.flatMap(section =>
      section.kind === 'grid' && section.provenance ? artifactProvenanceLines(section.provenance) : []
    )
  );
  if (references.size) provenance.addRow([]);
  for (const line of references) provenance.addRow([line]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
