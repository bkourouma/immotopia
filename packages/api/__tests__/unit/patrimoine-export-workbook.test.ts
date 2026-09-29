/* eslint-disable @typescript-eslint/no-explicit-any -- `Buffer` d'exceljs vs celui de Node (voir cast ci-dessous). */
/**
 * Export patrimoine — classeur Excel (lot P3).
 *
 * Vérifie les 7 feuilles attendues, leurs en-têtes, et surtout la
 * neutralisation d'une éventuelle injection de formule : un libellé de
 * dépense ou de programme de travaux saisi librement par un utilisateur
 * («=CMD()», «+HYPERLINK(...)», …) ne doit jamais atteindre le classeur en
 * tant que formule active.
 */
import ExcelJS from 'exceljs';
import { buildPatrimoineWorkbook, sanitizeXlsxText } from '../../src/lib/patrimoine/export/workbook';
import type { ExportProperty, PatrimoineExportData } from '../../src/lib/patrimoine/export/data';

function buildProperty(overrides: Partial<ExportProperty> = {}): ExportProperty {
  return {
    id: 'prop-1',
    internalReference: 'REF-001',
    title: 'Résidence Les Rôniers',
    propertyType: 'APPARTEMENT',
    status: 'AVAILABLE',
    address: 'Cocody, Abidjan',
    valuations: [{ valuatedAt: new Date('2026-01-01'), estimatedValue: 125000000, currency: 'XOF', method: 'MANUAL' }],
    loans: [
      {
        lender: 'Banque Atlantique',
        capitalAmount: 50000000,
        remainingCapital: 32000000,
        interestRate: 6.5,
        monthlyPayment: 850000,
        currency: 'XOF',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2030-01-01'),
        status: 'ACTIVE'
      }
    ],
    expenses: [
      {
        category: 'ROUTINE_MAINTENANCE',
        label: "=CMD('/K calc.exe'!A1)",
        amount: 1500000,
        currency: 'XOF',
        paidAt: new Date(),
        isCapitalized: false
      }
    ],
    workPrograms: [
      {
        title: '+HYPERLINK("http://evil")',
        status: 'PLANNED',
        estimatedCost: 4500000,
        actualCost: null,
        currency: 'XOF',
        plannedDate: new Date('2027-03-01'),
        completedDate: null
      }
    ],
    documents: [
      {
        type: 'INSURANCE',
        label: '@SUM(1+1)',
        expiresAt: new Date('2026-10-01'),
        state: 'EXPIRING_SOON',
        daysRemaining: 3
      }
    ],
    yield: {
      currentValue: 125000000,
      annualRent: 9600000,
      annualExpenses: 1500000,
      grossYield: 7.68,
      netYield: 6.1,
      netNetYield: 4.2,
      latentCapitalGain: 15000000
    },
    ...overrides
  };
}

function buildData(overrides: Partial<PatrimoineExportData> = {}): PatrimoineExportData {
  return {
    scope: 'AGENCY',
    generatedAt: new Date('2026-09-28T00:00:00.000Z'),
    overview: {
      totalProperties: 1,
      occupiedProperties: 1,
      occupancyRate: 1,
      totalEstimatedValue: 125000000,
      totalLoanBalance: 32000000,
      totalExpensesThisYear: 1500000,
      totalAnnualRent: 9600000
    },
    properties: [buildProperty()],
    ...overrides
  };
}

describe('sanitizeXlsxText', () => {
  it.each(['=CMD()', '+1', '-1', '@SUM(1)', '\ttab', '\rcr'])('prefixe une apostrophe devant %p', input => {
    expect(sanitizeXlsxText(input)).toBe(`'${input}`);
  });

  it('laisse un texte ordinaire inchangé', () => {
    expect(sanitizeXlsxText('Entretien climatisation')).toBe('Entretien climatisation');
  });
});

describe('buildPatrimoineWorkbook', () => {
  it('produit un classeur avec les 7 feuilles attendues, dans cet ordre', async () => {
    const buffer = await buildPatrimoineWorkbook(buildData());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const names = workbook.worksheets.map(sheet => sheet.name);
    expect(names).toEqual(['Synthèse', 'Biens', 'Valorisations', 'Emprunts', 'Dépenses', 'Travaux', 'Documents']);
  });

  it('pose des en-têtes en gras sur chaque feuille', async () => {
    const buffer = await buildPatrimoineWorkbook(buildData());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    for (const sheet of workbook.worksheets) {
      expect(sheet.getRow(1).font?.bold).toBe(true);
    }
  });

  it('neutralise un libellé de dépense commençant par « = » (injection de formule)', async () => {
    const buffer = await buildPatrimoineWorkbook(buildData());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const expenses = workbook.getWorksheet('Dépenses')!;
    const labelCell = expenses.getRow(2).getCell(4); // Référence, Bien, Catégorie, Libellé
    expect(String(labelCell.value)).toMatch(/^'=/);
    expect(labelCell.type).not.toBe(ExcelJS.ValueType.Formula);
  });

  it('neutralise un titre de programme de travaux commençant par « + »', async () => {
    const buffer = await buildPatrimoineWorkbook(buildData());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const works = workbook.getWorksheet('Travaux')!;
    const programCell = works.getRow(2).getCell(3); // Référence, Bien, Programme
    expect(String(programCell.value)).toMatch(/^'\+/);
  });

  it('se génère sans erreur pour une agence sans aucun bien', async () => {
    const data = buildData({ properties: [] });
    await expect(buildPatrimoineWorkbook(data)).resolves.toBeInstanceOf(Buffer);
  });

  it('traduit le type et le statut du bien dans la feuille « Biens », jamais en code brut', async () => {
    const buffer = await buildPatrimoineWorkbook(buildData());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const properties = workbook.getWorksheet('Biens')!;
    const row = properties.getRow(2); // Référence, Bien, Type, Statut
    expect(row.getCell(3).value).toBe('Appartement');
    expect(row.getCell(4).value).toBe('Disponible');
  });

  it('écrit les dates comme de vraies dates Excel, pas des chaînes', async () => {
    const buffer = await buildPatrimoineWorkbook(buildData());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const valuations = workbook.getWorksheet('Valorisations')!;
    const dateCell = valuations.getRow(2).getCell(3); // Référence, Bien, Date
    expect(dateCell.value).toBeInstanceOf(Date);
  });
});
