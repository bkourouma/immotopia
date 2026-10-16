import { saveBlob } from '../save-blob';
import { exportFilename } from './filename';
import type { ExportFormat, ExportTable, WriterOptions } from './types';

/**
 * Écrit un `ExportTable` dans le format demandé et le fait enregistrer par le
 * navigateur. Les écrivains (et exceljs / jspdf) sont chargés à la demande.
 *
 * Rend `'file'` quand un fichier a été téléchargé, `'print'` quand le PDF a
 * basculé sur le repli impression (l'utilisateur termine dans la boîte
 * d'impression).
 */
export async function writeExport(
  format: ExportFormat,
  table: ExportTable,
  filename: string,
  opts: WriterOptions
): Promise<'file' | 'print'> {
  if (format === 'csv') {
    const { buildCsvBlob } = await import('./csv');
    saveBlob(buildCsvBlob(table, opts.language), exportFilename(filename, 'csv'));
    return 'file';
  }
  if (format === 'xlsx') {
    const { buildXlsxBlob } = await import('./excel');
    saveBlob(await buildXlsxBlob(table, opts), exportFilename(filename, 'xlsx'));
    return 'file';
  }
  const { needsPrintFallback, buildPdfBlob } = await import('./pdf');
  if (needsPrintFallback(table, opts.title, opts.language)) {
    const { printTable } = await import('./print');
    await printTable(table, opts);
    return 'print';
  }
  saveBlob(await buildPdfBlob(table, opts), exportFilename(filename, 'pdf'));
  return 'file';
}
