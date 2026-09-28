/**
 * Export patrimoine — PDF de synthèse (lot P3).
 *
 * Même précaution que `syndics.owner-account-statement.pdf.test.ts` : des
 * montants >= 1 000 (séparateur de milliers WinAnsi-incompatible, voir
 * `lib/documents/pdf-text.ts`), des libellés accentués et un caractère arabe
 * (que la police standard ne sait pas encoder) ne doivent jamais faire échouer
 * la génération.
 */

const mockPrisma = {
  tenant: { findUnique: jest.fn() },
  syndicate: { findFirst: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import { PDFDocument, PDFPage } from 'pdf-lib';
import { runWithLanguage } from '../../src/i18n';
import { buildPatrimoinePdf } from '../../src/lib/patrimoine/export/pdf';
import type { ExportProperty, PatrimoineExportData } from '../../src/lib/patrimoine/export/data';

const TENANT_ID = 'tenant-1';

function buildProperty(overrides: Partial<ExportProperty> = {}): ExportProperty {
  return {
    id: 'prop-1',
    internalReference: 'REF-001',
    title: 'Résidence Les Rôniers',
    propertyType: 'APPARTEMENT',
    status: 'AVAILABLE',
    address: "Cocody, Abidjan — Côte d'Ivoire",
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
        label: 'Entretien climatisation T1',
        amount: 1500000,
        currency: 'XOF',
        paidAt: new Date(),
        isCapitalized: false
      }
    ],
    workPrograms: [
      {
        title: 'Réfection toiture',
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
        label: 'اتفاقية.pdf',
        expiresAt: new Date('2026-10-01'),
        state: 'EXPIRING_SOON',
        daysRemaining: 3
      },
      {
        type: 'TITLE_DEED',
        label: 'titre.pdf',
        expiresAt: new Date('2020-01-01'),
        state: 'EXPIRED',
        daysRemaining: -100
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
      totalProperties: 12,
      occupiedProperties: 9,
      occupancyRate: 0.75,
      totalEstimatedValue: 1250000000,
      totalLoanBalance: 320000000,
      totalExpensesThisYear: 45000000,
      totalAnnualRent: 96000000
    },
    properties: [buildProperty()],
    ...overrides
  };
}

beforeEach(() => {
  mockPrisma.tenant.findUnique.mockReset().mockResolvedValue(null);
  mockPrisma.syndicate.findFirst.mockReset();
});

describe('buildPatrimoinePdf', () => {
  it("produit un buffer PDF valide, avec l'en-tête %PDF", async () => {
    const buffer = await buildPatrimoinePdf(TENANT_ID, buildData());
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('se génère sans erreur avec des montants à huit chiffres (séparateur de milliers)', async () => {
    await expect(buildPatrimoinePdf(TENANT_ID, buildData())).resolves.toBeInstanceOf(Buffer);
  });

  it('se génère sans erreur pour un bien sans aucune donnée (0 valorisation, 0 emprunt, 0 document)', async () => {
    const empty = buildProperty({
      valuations: [],
      loans: [],
      expenses: [],
      workPrograms: [],
      documents: [],
      yield: {
        currentValue: 0,
        annualRent: 0,
        annualExpenses: 0,
        grossYield: 0,
        netYield: 0,
        netNetYield: null,
        latentCapitalGain: null
      }
    });
    const data = buildData({ properties: [empty] });
    await expect(buildPatrimoinePdf(TENANT_ID, data)).resolves.toBeInstanceOf(Buffer);
  });

  it('se génère sans erreur pour une agence sans aucun bien (0 propriété)', async () => {
    const data = buildData({ properties: [] });
    const buffer = await buildPatrimoinePdf(TENANT_ID, data);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('accepte des libellés avec des retours à la ligne sans lever', async () => {
    const withNewline = buildProperty({ title: 'Résidence\nLes Rôniers\r\nBâtiment A' });
    await expect(buildPatrimoinePdf(TENANT_ID, buildData({ properties: [withNewline] }))).resolves.toBeInstanceOf(
      Buffer
    );
  });

  it('rend en français même quand la requête est en arabe (police standard non arabophone)', async () => {
    const buffer = await runWithLanguage('ar', () => buildPatrimoinePdf(TENANT_ID, buildData()));
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('se génère sans erreur quand les biens portent des devises différentes (montants consolidés non convertibles)', async () => {
    const propertyXof = buildProperty({ id: 'prop-xof' });
    const propertyEur = buildProperty({
      id: 'prop-eur',
      internalReference: 'REF-002',
      valuations: [{ valuatedAt: new Date('2026-01-01'), estimatedValue: 300000, currency: 'EUR', method: 'MANUAL' }],
      loans: [],
      expenses: [],
      documents: []
    });
    const data = buildData({ properties: [propertyXof, propertyEur] });
    await expect(buildPatrimoinePdf(TENANT_ID, data)).resolves.toBeInstanceOf(Buffer);
  });

  it('restreint le document à un seul bien pour un export de bien', async () => {
    const data = buildData({ scope: 'PROPERTY', overview: null });
    const buffer = await buildPatrimoinePdf(TENANT_ID, data);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('produit plusieurs pages quand le contenu de plusieurs biens dépasse une page A4', async () => {
    const manyProperties = Array.from({ length: 25 }, (_, i) =>
      buildProperty({ id: `prop-${i}`, internalReference: `REF-${i}`, title: `Bien ${i}` })
    );
    const buffer = await buildPatrimoinePdf(TENANT_ID, buildData({ properties: manyProperties }));
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("redessine l'en-tête du tableau « Performance par bien » sur chaque nouvelle page (120 biens)", async () => {
    // Génération réelle (pas de mock de pdf-lib) : on espionne `drawText` sans
    // remplacer son implémentation, pour observer sur quelles pages l'en-tête
    // du tableau ("Net-net", propre à la ligne d'en-tête, jamais une valeur de
    // rendement) est effectivement dessiné.
    const manyProperties = Array.from({ length: 120 }, (_, i) =>
      buildProperty({ id: `prop-${i}`, internalReference: `REF-${i}`, title: `Bien ${i}` })
    );
    const data = buildData({ properties: manyProperties });

    const original = PDFPage.prototype.drawText;
    const headerPagesSeen = new Set<PDFPage>();
    const spy = jest.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (
      this: PDFPage,
      text: string,
      options?: Parameters<typeof original>[1]
    ) {
      if (text === 'Net-net') headerPagesSeen.add(this);
      return original.call(this, text, options);
    });

    try {
      const buffer = await buildPatrimoinePdf(TENANT_ID, data);
      const doc = await PDFDocument.load(buffer);
      expect(doc.getPageCount()).toBeGreaterThan(1);
      // Avant correction, l'en-tête n'était dessiné qu'une seule fois (première
      // page du tableau) : cette assertion aurait échoué (`size` === 1).
      expect(headerPagesSeen.size).toBeGreaterThan(1);
    } finally {
      spy.mockRestore();
    }
  });
});
