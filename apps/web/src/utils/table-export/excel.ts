import { neutralizeFormula } from '../copilot-artifact';
import type { ExportCell, ExportTable } from './types';

/**
 * Excel (exceljs, chargé à la demande) : une feuille, en-tête gras figé avec
 * filtre automatique, largeurs selon le contenu (bornées), formats numériques,
 * formules neutralisées.
 */

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIN_WIDTH = 8;
const MAX_WIDTH = 60;

/** Nom de feuille Excel : 31 caractères au plus, sans `[]:*?/\`. */
export function sheetName(title: string, fallback = 'Export'): string {
  const cleaned = title
    .replace(/[[\]:*?/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^'+|'+$/g, '')
    .slice(0, 31)
    .trim();
  return cleaned || fallback;
}

function excelValue(cell: ExportCell): string | number | boolean | Date | null {
  if (typeof cell.value === 'string') return neutralizeFormula(cell.value);
  return cell.value;
}

function columnWidth(header: string, rows: ExportCell[][], index: number): number {
  let longest = header.length;
  for (const row of rows) {
    const cell = row[index];
    const length = (cell?.text.length ?? 0) + (cell?.indent ? cell.indent * 2 : 0);
    if (length > longest) longest = length;
  }
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest + 2));
}

export async function buildXlsxBlob(table: ExportTable, opts: { title: string; language: string }): Promise<Blob> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName(opts.title), {
    views: [{ state: 'frozen', ySplit: 1, rightToLeft: opts.language === 'ar' }]
  });

  sheet.addRow(table.columns.map(c => neutralizeFormula(c.header)));
  for (const row of table.rows) sheet.addRow(row.map(excelValue));

  const header = sheet.getRow(1);
  header.font = { bold: true };

  table.columns.forEach((column, index) => {
    const col = sheet.getColumn(index + 1);
    col.width = columnWidth(column.header, table.rows, index);
    if (column.numeric) col.numFmt = column.integer ? '#,##0' : '#,##0.##';
  });
  // Le format de colonne ne s'applique pas à l'en-tête, qui reste du texte.
  header.eachCell(cell => {
    cell.numFmt = '@';
  });

  table.rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell.indent) sheet.getCell(rowIndex + 2, colIndex + 1).alignment = { indent: cell.indent };
      if (cell.kind === 'date') sheet.getCell(rowIndex + 2, colIndex + 1).numFmt = 'dd/mm/yyyy';
    });
  });

  if (table.columns.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_TYPE });
}
