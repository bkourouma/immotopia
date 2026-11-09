import { PDFDocument } from 'pdf-lib';
import * as arabicPdf from '../../src/lib/documents/pdf-arabic';
import { renderArabicPlatformInvoicePdf } from '../../src/lib/subscription/platform-invoice-pdf-ar';
import type { PlatformInvoicePdfPayload } from '../../src/lib/subscription/platform-invoice-pdf';

function invoice(start: string, end: string): PlatformInvoicePdfPayload {
  return {
    invoiceNumber: 'IMT-TEST-001',
    nature: 'PERIOD',
    status: 'ISSUED',
    issueDate: new Date(start),
    dueDate: new Date(end),
    periodStart: new Date(start),
    periodEnd: new Date(end),
    currency: 'XOF',
    issuer: { name: 'ImmoTopia', address: 'Abidjan', phone: null, email: null, rccm: null, taxId: null },
    customer: { tenantId: 'tenant-test', name: 'Agence test', address: null, email: null, phone: null, taxId: null },
    lines: [
      {
        kind: 'PACK',
        label: 'Abonnement mensuel',
        quantity: 1,
        unitPrice: 15000,
        amount: 15000,
        periodStart: new Date(start),
        periodEnd: new Date(end)
      }
    ],
    amountExclTax: 15000,
    taxRate: 0,
    taxAmount: 0,
    amountTotal: 15000
  };
}

describe('Facture plateforme arabe — fin exclusive des périodes', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['fin de mois', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', '01/11/2026 - 30/11/2026'],
    ['changement d’année', '2026-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', '01/12/2026 - 31/12/2026'],
    ['février bissextile', '2024-02-01T00:00:00.000Z', '2024-03-01T00:00:00.000Z', '01/02/2024 - 29/02/2024']
  ])('affiche le dernier jour inclus pour %s sans modifier les dates sources', async (_label, start, end, expected) => {
    // Les espions conservent le vrai rendu : le document et ses polices sont effectivement produits.
    const text = jest.spyOn(arabicPdf, 'drawArabicText');
    const number = jest.spyOn(arabicPdf, 'drawArabicNumber');
    const payload = invoice(start, end);
    const original = JSON.stringify(payload);

    const buffer = await renderArabicPlatformInvoicePdf(payload);

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect((await PDFDocument.load(buffer)).getPageCount()).toBe(1);
    // La période de ligne est du texte, celle de l'en-tête une cellule LTR.
    expect(text.mock.calls.map(call => call[2])).toContain(expected);
    expect(number.mock.calls.map(call => call[2])).toContain(expected);
    const exclusive = new Date(end).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
    expect(text.mock.calls.map(call => call[2])).not.toContain(`${expected.split(' - ')[0]} - ${exclusive}`);
    expect(JSON.stringify(payload)).toBe(original);
  });
});
