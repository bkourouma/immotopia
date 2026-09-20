import { feedback } from '../lib/feedback';
import { t } from '../i18n/t';

/**
 * CSV / Excel export helpers.
 *
 * Excel generation uses exceljs, loaded on demand: it is a large dependency and
 * only a handful of screens have an export button, so it must not sit in the
 * main bundle. (It replaces `xlsx` 0.18.5, whose published npm build carries
 * unpatched prototype-pollution and ReDoS advisories.)
 */

/** Trigger a browser download for a generated Blob. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Render one cell value for CSV, quoting and escaping as needed. */
function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'object') {
    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
  }

  const asString = String(value);
  if (asString.includes(',') || asString.includes('"') || asString.includes('\n')) {
    return `"${asString.replace(/"/g, '""')}"`;
  }

  return asString;
}

/**
 * Export data to CSV format
 */
export function exportToCSV(data: any[], filename: string): void {
  if (!data || data.length === 0) {
    // Module hors React : `App.useApp()` y est impossible. La passerelle
    // rejoue le `message` contextualise pose par <FeedbackBridge/> (§5.7).
    feedback.warning(t('Aucune donnée à exporter'));
    return;
  }

  const headers = Object.keys(data[0]);

  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => toCsvCell(row[header])).join(','))
  ].join('\n');

  // BOM so Excel opens UTF-8 accents correctly.
  downloadBlob(new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
}

/** Values exceljs cannot write directly are rendered as text. */
function toExcelCell(value: unknown): string | number | boolean | Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Export data to Excel format.
 * Async because exceljs is code-split out of the main bundle.
 */
export async function exportToExcel(data: any[], filename: string, sheetName: string = 'Sheet1'): Promise<void> {
  if (!data || data.length === 0) {
    // Module hors React : `App.useApp()` y est impossible. La passerelle
    // rejoue le `message` contextualise pose par <FeedbackBridge/> (§5.7).
    feedback.warning(t('Aucune donnée à exporter'));
    return;
  }

  const ExcelJS = await import('exceljs');

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  const headers = Object.keys(data[0]);
  worksheet.columns = headers.map(header => ({
    header,
    key: header,
    width: Math.min(Math.max(header.length + 2, 12), 50)
  }));
  worksheet.getRow(1).font = { bold: true };

  for (const row of data) {
    worksheet.addRow(headers.map(header => toExcelCell(row[header])));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${filename}.xlsx`
  );
}
