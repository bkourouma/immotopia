import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExportTable } from '../../utils/table-export/types';

/**
 * Écrivains Excel et PDF testés au niveau de leurs entrées : exceljs et jsPDF
 * sont remplacés par des doublures qui enregistrent les appels.
 */

const calls = vi.hoisted(() => ({
  rows: [] as unknown[][],
  sheetName: '',
  sheetOptions: undefined as unknown,
  columns: [] as { width?: number; numFmt?: string }[],
  autoFilter: undefined as unknown,
  pdfTexts: [] as string[],
  autoTable: undefined as unknown
}));

vi.mock('exceljs', () => {
  class Workbook {
    xlsx = { writeBuffer: async () => new Uint8Array([1, 2, 3]) };
    addWorksheet(name: string, options: unknown) {
      calls.sheetName = name;
      calls.sheetOptions = options;
      const header = { font: undefined as unknown, eachCell: (_cb: unknown) => undefined };
      const sheet = {
        addRow: (row: unknown[]) => calls.rows.push(row),
        getRow: () => header,
        getColumn: (i: number) => (calls.columns[i - 1] ??= {}),
        getCell: () => ({}),
        set autoFilter(value: unknown) {
          calls.autoFilter = value;
        }
      };
      return sheet;
    }
  }
  return { Workbook, default: { Workbook } };
});

vi.mock('jspdf', () => {
  class jsPDF {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    setFontSize() {}
    setTextColor() {}
    setPage() {}
    getNumberOfPages() {
      return 2;
    }
    text(value: string) {
      calls.pdfTexts.push(value);
    }
    output() {
      return new Blob(['pdf']);
    }
  }
  return { jsPDF, default: jsPDF };
});

vi.mock('jspdf-autotable', () => ({
  default: (_doc: unknown, options: unknown) => {
    calls.autoTable = options;
  }
}));

const table: ExportTable = {
  columns: [
    { header: 'Nom', numeric: false, integer: true },
    { header: 'Prix', numeric: true, integer: true }
  ],
  rows: [
    [
      { text: '=cmd', value: '=cmd', kind: 'text' },
      { text: '1 000', value: 1000, kind: 'number' }
    ]
  ]
};

beforeEach(() => {
  calls.rows = [];
  calls.columns = [];
  calls.pdfTexts = [];
});

describe('écrivain Excel', () => {
  it('écrit en-tête, valeurs typées, formules neutralisées, format et filtre', async () => {
    const { buildXlsxBlob } = await import('../../utils/table-export/excel');
    const blob = await buildXlsxBlob(table, { title: 'Baux', language: 'fr' });
    expect(blob.size).toBe(3);
    expect(calls.sheetName).toBe('Baux');
    expect(calls.sheetOptions).toMatchObject({ views: [{ state: 'frozen', ySplit: 1 }] });
    expect(calls.rows).toEqual([
      ['Nom', 'Prix'],
      ["'=cmd", 1000]
    ]);
    expect(calls.columns[1].numFmt).toBe('#,##0');
    expect(calls.autoFilter).toEqual({ from: { row: 1, column: 1 }, to: { row: 1, column: 2 } });
  });

  it('retourne la feuille pour l’arabe', async () => {
    const { buildXlsxBlob } = await import('../../utils/table-export/excel');
    await buildXlsxBlob(table, { title: 'Baux', language: 'ar' });
    expect(calls.sheetOptions).toMatchObject({ views: [{ rightToLeft: true }] });
  });
});

describe('écrivain PDF', () => {
  it('construit le tableau avec en-têtes, corps et pied « Page x / y »', async () => {
    const { buildPdfBlob } = await import('../../utils/table-export/pdf');
    const blob = await buildPdfBlob(table, { title: 'Baux', language: 'fr', locale: 'fr-FR' });
    expect(blob.size).toBeGreaterThan(0);
    expect(calls.autoTable).toMatchObject({
      head: [['Nom', 'Prix']],
      body: [['=cmd', '1 000']],
      showHead: 'everyPage'
    });
    expect(calls.pdfTexts).toContain('Baux');
    expect(calls.pdfTexts).toContain('Page 1 / 2');
    expect(calls.pdfTexts).toContain('Page 2 / 2');
  });
});
