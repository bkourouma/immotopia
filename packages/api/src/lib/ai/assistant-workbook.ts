import { Workbook } from 'exceljs';
import { fromBufferPromise } from 'yauzl';
import { t } from '../../i18n';
import { BadRequestError } from '../../middleware/error-middleware';

const MAX_EXPANDED = 16 * 1024 * 1024;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';

function invalidWorkbook() {
  return new BadRequestError(t('Le fichier doit être un classeur XLSX valide dans les limites d’import.'));
}

async function verifyArchive(buffer: Buffer) {
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) throw invalidWorkbook();
  const zip = await fromBufferPromise(buffer, { validateEntrySizes: true, strictFileNames: true });
  try {
    if (zip.entryCount > 200) throw invalidWorkbook();
    const paths = new Set<string>();
    let expandedSize = 0;
    let hasManifest = false;
    for await (const entry of zip.eachEntry()) {
      if (paths.has(entry.fileName) || entry.isEncrypted()) throw invalidWorkbook();
      paths.add(entry.fileName);
      if (entry.fileName.endsWith('/')) continue;
      if (expandedSize + entry.uncompressedSize > MAX_EXPANDED) throw invalidWorkbook();
      const isManifest = entry.fileName === '[Content_Types].xml';
      if (isManifest && entry.uncompressedSize > 256 * 1024) throw invalidWorkbook();
      const manifest: Buffer[] = [];
      const stream = await zip.openReadStreamPromise(entry);
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        expandedSize += chunk.length;
        if (expandedSize > MAX_EXPANDED) throw invalidWorkbook();
        if (isManifest) manifest.push(chunk);
      }
      if (isManifest) hasManifest = Buffer.concat(manifest).includes(XLSX_TYPE);
    }
    if (!hasManifest || !paths.has('xl/workbook.xml')) throw invalidWorkbook();
  } finally {
    zip.close();
  }
}

export async function readAssistantWorkbook(
  buffer: Buffer,
  limits: { rows: number; columns: number; cellLength: number }
): Promise<{ sheetName: string; lines: string[][] }> {
  try {
    await verifyArchive(buffer);
    const workbook = new Workbook();
    await workbook.xlsx.load(new Uint8Array(buffer).buffer, {
      ignoreNodes: ['drawing', 'conditionalFormatting', 'dataValidations', 'hyperlinks']
    });
    const sheet = workbook.worksheets.find(candidate => candidate.state === 'visible' && candidate.actualRowCount > 0);
    if (!sheet) throw invalidWorkbook();
    const lines: string[][] = [];
    let width = 0;
    sheet.eachRow(row => {
      if (lines.length >= limits.rows + 2) return;
      const values: string[] = [];
      row.eachCell((cell, column) => {
        // ExcelJS expose seulement la valeur mise en cache d’une formule.
        const raw = cell.formula ? cell.result : cell.value;
        const value =
          raw == null || (typeof raw === 'object' && 'error' in raw)
            ? ''
            : raw instanceof Date
              ? raw.toISOString()
              : typeof raw === 'number' || typeof raw === 'boolean'
                ? String(raw)
                : cell.text;
        if (value.length > limits.cellLength || (value.trim() && column > limits.columns)) throw invalidWorkbook();
        if (value.trim()) values[column - 1] = value;
      });
      if (values.length === 0) return;
      if (lines.length === 0) width = values.length;
      if (values.length > width) throw invalidWorkbook();
      lines.push(Array.from({ length: width }, (_, index) => values[index] ?? ''));
    });
    return { sheetName: sheet.name, lines };
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw invalidWorkbook();
  }
}
