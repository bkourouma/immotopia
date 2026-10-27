/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Relevé de compte financier et bon de caisse : en-tête standard de l'agence
 * (nom, coordonnées), pied de page paginé, accents sûrs, relevé sur plusieurs
 * pages. Sans base : client Prisma doublé.
 */
const mockPrisma: any = {
  tenant: { findUnique: jest.fn() },
  syndicate: { findFirst: jest.fn() },
  cashVoucher: { findFirst: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import { PDFDocument, PDFPage } from 'pdf-lib';
import { buildAccountStatementPdf } from '../../src/lib/finance/statement-pdf';
import { printCashVoucherHandler } from '../../src/controllers/finance-sites-controller';

const TENANT = 'tenant-a';
const VOUCHER_ID = '11111111-1111-4111-8111-111111111111';

let texts: string[];
let drawn: Array<{ text: string; x: number; size: number; font: any }>;
beforeEach(() => {
  texts = [];
  drawn = [];
  const original = PDFPage.prototype.drawText;
  jest.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text: string, options?: any) {
    texts.push(text);
    drawn.push({ text, x: options?.x, size: options?.size, font: options?.font });
    return original.call(this, text, options);
  });
  mockPrisma.syndicate.findFirst.mockResolvedValue(null);
  mockPrisma.tenant.findUnique.mockResolvedValue({
    name: 'Agence Éléonore',
    legalName: null,
    address: 'Plateau',
    city: 'Abidjan',
    country: null,
    contactPhone: '+225 27 00 00',
    contactEmail: null,
    logoUrl: null,
    documentSignaturePath: null,
    documentStampPath: null,
    financeSettings: null
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

function movement(index: number): any {
  return {
    movementDate: new Date('2026-09-01'),
    type: 'INVOICE',
    label: `Loyer de septembre n° ${index} — Éléonore ✓`,
    amountBilled: 1234567,
    amountSettled: 0,
    balanceAfter: 1234567 * index
  };
}

describe('relevé de compte financier (PDF)', () => {
  it("porte l'en-tête de l'agence, le titre, les soldes et un pied paginé", async () => {
    const buffer = await buildAccountStatementPdf({
      tenantId: TENANT,
      accountLabel: 'Compte locataire Awa Koné',
      currency: 'FCFA',
      openingBalance: 0,
      closingBalance: 2469134,
      periodFrom: new Date('2026-09-01'),
      periodTo: new Date('2026-09-30'),
      movements: [movement(1), movement(2)]
    });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: TENANT } }));
    expect(mockPrisma.syndicate.findFirst).not.toHaveBeenCalled();
    expect(texts).toEqual(expect.arrayContaining(['Agence Éléonore', 'Relevé de compte']));
    expect(texts.some(text => text.startsWith('Compte : Compte locataire Awa Koné'))).toBe(true);
    expect(texts.some(text => text.startsWith('Solde de clôture'))).toBe(true);
    expect(texts).toContain('Réf. Compte locataire Awa Koné - Page 1/1');
    expect(texts.every(text => !/[\u202f\u00a0]/.test(text))).toBe(true);
  });

  it('poursuit sur plusieurs pages au lieu de tronquer, colonnes reprises', async () => {
    const movements = Array.from({ length: 120 }, (_, index) => movement(index + 1));
    const buffer = await buildAccountStatementPdf({
      tenantId: TENANT,
      accountLabel: 'C1',
      currency: 'FCFA',
      openingBalance: 0,
      closingBalance: 0,
      movements
    });
    const pdf = await PDFDocument.load(buffer);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(texts.filter(text => text === 'Libellé')).toHaveLength(pdf.getPageCount());
    expect(texts).toContain(`Réf. C1 - Page ${pdf.getPageCount()}/${pdf.getPageCount()}`);
  });

  it('écrit les gros montants en entier, alignés à droite, sans dépasser la marge droite', async () => {
    await buildAccountStatementPdf({
      tenantId: TENANT,
      accountLabel: 'C1',
      currency: 'FCFA',
      openingBalance: 0,
      closingBalance: 0,
      movements: [
        { ...movement(1), amountBilled: 12345678, amountSettled: 12345678, balanceAfter: -12345678 },
        { ...movement(2), amountBilled: 12345678, amountSettled: 0, balanceAfter: 98765432.1 }
      ]
    });
    const amounts = drawn.filter(item => /FCFA$/.test(item.text) && item.font);
    expect(amounts.map(item => item.text)).toEqual(
      expect.arrayContaining(['12 345 678,00 FCFA', '-12 345 678,00 FCFA', '98 765 432,10 FCFA'])
    );
    expect(drawn.filter(item => /^-?[\d ,]+( F(C(F(A)?)?)?)?\.\.\.$/.test(item.text))).toEqual([]);
    for (const item of amounts) {
      expect(item.x + item.font.widthOfTextAtSize(item.text, item.size)).toBeLessThanOrEqual(555.01);
    }
  });

  it("sort sans identité d'agence connue (document toujours produit)", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    const buffer = await buildAccountStatementPdf({
      tenantId: TENANT,
      accountLabel: 'C1',
      currency: 'FCFA',
      openingBalance: 0,
      closingBalance: 0,
      movements: []
    });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('bon de caisse (PDF)', () => {
  function run(voucher: any) {
    mockPrisma.cashVoucher.findFirst.mockResolvedValue(voucher);
    const req: any = { params: { tenantId: TENANT, voucherId: VOUCHER_ID }, tenantContext: { tenantId: TENANT } };
    const headers: Record<string, string> = {};
    const res: any = {
      setHeader: (name: string, value: string) => (headers[name] = value),
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    };
    return { req, res, headers, done: new Promise<void>(resolve => (res.send = jest.fn(() => resolve()))) };
  }

  const baseVoucher = {
    voucherYear: 2026,
    voucherNumber: 7,
    beneficiaryName: 'Société Générale du Bâtiment ✓',
    amount: 1500000,
    currency: 'FCFA',
    reason: 'Achat de ciment — acompte',
    voucherDate: new Date('2026-09-20'),
    site: { name: 'Chantier Cocody' },
    costCategory: { label: 'Matériaux' },
    validatedAt: new Date('2026-09-21')
  };

  it("filtre l'agence, porte l'en-tête standard et le pied avec le numéro", async () => {
    const { req, res, done } = run({ ...baseVoucher });
    printCashVoucherHandler(req, res, jest.fn());
    await done;
    expect(mockPrisma.cashVoucher.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: VOUCHER_ID, tenantId: TENANT } })
    );
    expect(texts).toEqual(expect.arrayContaining(['Agence Éléonore', 'Bon de caisse']));
    expect(texts.some(text => text.startsWith('Pièce n° '))).toBe(true);
    expect(texts.some(text => /^Réf\. .* - Page 1\/1$/.test(text))).toBe(true);
    const pdf = await PDFDocument.load(res.send.mock.calls[0][0]);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('un brouillon dit que le numéro sera attribué à la validation', async () => {
    const { req, res, done } = run({ ...baseVoucher, voucherNumber: null, validatedAt: null });
    printCashVoucherHandler(req, res, jest.fn());
    await done;
    expect(texts).toContain('Pièce n° : attribué à la validation');
  });
});
