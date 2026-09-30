/**
 * BUG-2026-09-30-043 / 044 : une quittance se genere depuis un bail (dernier
 * paiement encaisse ou paiement d'une echeance) et le modele du contrat suit
 * le type du bien. Prisma est simule.
 */
const rentalLeaseFindFirst = jest.fn();
const rentalPaymentFindFirst = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalLease: { findFirst: (...a: any[]) => rentalLeaseFindFirst(...a) },
    rentalPayment: { findFirst: (...a: any[]) => rentalPaymentFindFirst(...a) }
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/document-template-service', () => ({ resolveTemplate: jest.fn() }));
jest.mock('../../src/services/document-context-builder', () => ({
  buildDocumentContext: jest.fn(),
  validateContext: jest.fn()
}));
jest.mock('../../src/services/docx-renderer', () => ({
  renderDocx: jest.fn(),
  calculateHash: jest.fn(),
  saveGeneratedDocument: jest.fn()
}));

import { BadRequestError, NotFoundError } from '../../src/middleware/error-middleware';
import { resolveLeaseDocumentType, resolveReceiptPaymentId } from '../../src/services/document-generation-service';

beforeEach(() => jest.clearAllMocks());

describe('resolveLeaseDocumentType', () => {
  it.each([
    ['BOUTIQUE_COMMERCIAL', 'LEASE_COMMERCIAL'],
    ['BUREAU', 'LEASE_COMMERCIAL'],
    ['ENTREPOT_INDUSTRIEL', 'LEASE_COMMERCIAL'],
    ['APPARTEMENT', 'LEASE_HABITATION'],
    ['MAISON_VILLA', 'LEASE_HABITATION']
  ])('bien %s : %s', async (propertyType, expected) => {
    rentalLeaseFindFirst.mockResolvedValue({ property: { propertyType } });
    await expect(resolveLeaseDocumentType('agency-1', 'lease-1')).resolves.toBe(expected);
    expect(rentalLeaseFindFirst.mock.calls[0][0].where).toEqual({ id: 'lease-1', tenant_id: 'agency-1' });
  });

  it("bail d'une autre agence ou inexistant : NotFoundError", async () => {
    rentalLeaseFindFirst.mockResolvedValue(null);
    await expect(resolveLeaseDocumentType('agency-1', 'lease-x')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('resolveReceiptPaymentId', () => {
  it('un identifiant de paiement est conserve', async () => {
    rentalPaymentFindFirst.mockResolvedValue({ id: 'pay-1' });
    await expect(resolveReceiptPaymentId('agency-1', 'pay-1')).resolves.toBe('pay-1');
    expect(rentalPaymentFindFirst.mock.calls[0][0].where).toEqual({ id: 'pay-1', tenant_id: 'agency-1' });
  });

  it("un bail : dernier paiement encaisse, dans l'agence", async () => {
    rentalPaymentFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'pay-last' });
    rentalLeaseFindFirst.mockResolvedValue({ id: 'lease-1' });

    await expect(resolveReceiptPaymentId('agency-1', 'lease-1')).resolves.toBe('pay-last');
    const where = rentalPaymentFindFirst.mock.calls[1][0].where;
    expect(where).toEqual({ tenant_id: 'agency-1', lease_id: 'lease-1', status: 'SUCCESS' });
    expect(rentalLeaseFindFirst.mock.calls[0][0].where).toEqual({ id: 'lease-1', tenant_id: 'agency-1' });
  });

  it('un bail et une echeance : le paiement affecte a cette echeance', async () => {
    rentalPaymentFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'pay-aout' });
    rentalLeaseFindFirst.mockResolvedValue({ id: 'lease-1' });

    await expect(resolveReceiptPaymentId('agency-1', 'lease-1', 'inst-8')).resolves.toBe('pay-aout');
    expect(rentalPaymentFindFirst.mock.calls[1][0].where.allocations).toEqual({
      some: { installment_id: 'inst-8', tenant_id: 'agency-1' }
    });
  });

  it('bail sans paiement encaisse : message clair, pas une erreur generique', async () => {
    rentalPaymentFindFirst.mockResolvedValue(null);
    rentalLeaseFindFirst.mockResolvedValue({ id: 'lease-1' });

    const error = await resolveReceiptPaymentId('agency-1', 'lease-1').catch(e => e);
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toContain('Aucun paiement encaissé');
  });

  it("ni paiement ni bail dans l'agence : NotFoundError", async () => {
    rentalPaymentFindFirst.mockResolvedValue(null);
    rentalLeaseFindFirst.mockResolvedValue(null);
    await expect(resolveReceiptPaymentId('agency-1', 'autre')).rejects.toBeInstanceOf(NotFoundError);
  });
});
