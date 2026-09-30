/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BUG-2026-09-30-094 : rapport de revenus PDF en 500 (espaces insécables fines
 * de Intl fr-FR non encodables en WinAnsi) et exports CSV non échappés.
 */
const mockPrisma: any = {
  rentalPayment: { findMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import {
  generateRevenueReportPDF,
  generateRevenueReportCSV,
  exportData,
  pdfSafe
} from '../../src/utils/report-generator';
import { csvCell, toCsvString } from '../../src/lib/csv';

const data: any = {
  startDate: new Date('2026-09-01'),
  endDate: new Date('2026-09-30'),
  totalRevenue: 987654321, // 9 chiffres : séparateurs U+202F avec Intl fr-FR
  paymentCount: 2,
  revenuesByProperty: [
    {
      propertyAddress: 'Rue des Flamboyants, Riviera Golf, Cocody, Abidjan – Éléonore ✓',
      revenue: 650000,
      paymentCount: 2
    }
  ],
  revenuesByMonth: [{ month: '2026-09', revenue: 650000 }]
};

describe('rapport de revenus', () => {
  it('PDF : ne lève pas (adresse à virgule, accents, montants à 9 chiffres)', async () => {
    const buffer = await generateRevenueReportPDF(data, 'tenant-a');
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('pdfSafe remplace les caractères non encodables', () => {
    expect(pdfSafe('1 000 F')).toBe('1 000 F');
    expect(pdfSafe('Éléonore ✓')).toBe('Éléonore ?');
  });

  it('CSV : adresse entre guillemets', async () => {
    const text = (await generateRevenueReportCSV(data, 'tenant-a')).toString('utf-8');
    expect(text).toContain('"Rue des Flamboyants, Riviera Golf, Cocody, Abidjan');
  });
});

describe('export CSV des paiements', () => {
  it("protège l'adresse à virgule, garde 7 colonnes, BOM et CRLF", async () => {
    mockPrisma.rentalPayment.findMany.mockResolvedValue([
      {
        id: 'pay-1',
        amount: 350000,
        succeeded_at: new Date('2026-09-30'),
        method: 'CASH',
        status: 'SUCCESS',
        lease: {
          property: { address: '=HYPERLINK("http://x"), Rue des Flamboyants, Riviera Golf' },
          primaryRenter: { user: { fullName: 'Fatou Diarra' } }
        }
      }
    ]);
    const buf = await exportData('payments', ['p1'], 'tenant-a', {}, 'csv');
    const text = buf.toString('utf-8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const line = text.split('\r\n')[1];
    expect(line).toContain('"\'=HYPERLINK(""http://x""), Rue des Flamboyants, Riviera Golf"');
    expect(line.endsWith(',Fatou Diarra,350000,30/09/2026,CASH,SUCCESS')).toBe(true);
  });
});

describe('utilitaire CSV partagé', () => {
  it.each([
    ['a,b', '"a,b"'],
    ['dit "oui"', '"dit ""oui"""'],
    ['ligne1\nligne2', '"ligne1\nligne2"'],
    ['=1+1', "'=1+1"],
    ['+33 1', "'+33 1"],
    ['@cmd', "'@cmd"],
    ['-cmd', "'-cmd"],
    ['-', '-'],
    ['-350000', '-350000']
  ])('%j -> %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it('les nombres négatifs ne sont pas préfixés ; séparateur ;', () => {
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell('a;b', ';')).toBe('"a;b"');
    expect(toCsvString([['x', 1]], { bom: false })).toBe('x,1');
  });
});
