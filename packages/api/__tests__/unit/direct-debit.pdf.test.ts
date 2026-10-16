/**
 * PDF d'autorisation de prélèvement — spec 042, PB3-R1.
 * Rendu pur (pas de base) : une page A4 valide, sans image de marque.
 */

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/services/audit-service', () => ({ recordAuditEvent: jest.fn(), logAuditEvent: jest.fn() }));

import { PDFDocument } from 'pdf-lib';
import { authorizationFileName, renderAuthorizationPdf } from '../../src/lib/direct-debit/authorization-pdf';

const branding = {
  issuer: {
    kind: 'AGENCY' as const,
    name: 'Agence Test',
    legalName: null,
    address: 'Abidjan, Cocody',
    phone: null,
    email: null,
    rccm: null,
    taxId: null
  },
  issuerLogo: null,
  signature: null,
  stamp: null,
  syndicate: null
};

const data = {
  reference: 'MDT-2026-0001',
  creditorLabel: 'Compte loyers',
  creditorIdentifier: null,
  creditorBankName: 'Banque Test',
  debtorName: 'Awa Traoré',
  holderName: 'Awa Traoré — œuvre « spéciale » ’’',
  iban: 'CI93CI0080111301134291200589',
  bankCode: 'CI008',
  leaseNumber: 'BAIL-001',
  propertyLabel: 'Villa 4 pièces - Cocody',
  maxAmount: 150000,
  collectionDay: 5,
  currency: 'FCFA'
};

describe('direct-debit / PDF d autorisation', () => {
  it('produit un PDF d une page, même avec des caractères hors WinAnsi', async () => {
    const buffer = await renderAuthorizationPdf({ ...data, holderName: `${data.holderName} 日本語` }, branding);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const pdf = await PDFDocument.load(buffer);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe('Autorisation de prélèvement MDT-2026-0001');
  });

  it('accepte un mandat sans plafond ni bail', async () => {
    const buffer = await renderAuthorizationPdf(
      { ...data, maxAmount: null, leaseNumber: null, propertyLabel: null, debtorName: null },
      branding
    );
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('nomme le fichier sans caractère interdit', () => {
    expect(authorizationFileName('MDT-2026-0001')).toBe('Autorisation de prélèvement MDT-2026-0001.pdf');
  });
});
