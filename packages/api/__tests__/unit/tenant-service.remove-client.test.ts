/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * removeTenantClient : le retrait d'un compte client supprime sa fiche et, en
 * cascade, son historique locatif et financier. Refus (409) dès qu'il existe.
 */
const mockPrisma: any = {
  tenantClient: { findUnique: jest.fn(), delete: jest.fn() }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), AuditActionKey: {} }));
jest.mock('../../src/middleware/session-invalidation', () => ({ revokeTenantSessions: jest.fn() }));

import { removeTenantClient } from '../../src/services/tenant-service';
import { ConflictError, NotFoundError } from '../../src/middleware/error-middleware';

const VIDE = {
  primaryLeases: 0,
  ownerLeases: 0,
  coRenterLeases: 0,
  directDebitMandates: 0,
  rentalPayments: 0,
  paymentDeclarations: 0,
  thirdPartyAccounts: 0,
  ownerPayouts: 0,
  ownershipShares: 0,
  saleMandatesAsSeller: 0
};

function client(compteurs: Partial<typeof VIDE> = {}, managementTerms: { id: string } | null = null) {
  return { id: 'tc1', _count: { ...VIDE, ...compteurs }, managementTerms };
}

describe('removeTenantClient', () => {
  beforeEach(() => {
    mockPrisma.tenantClient.findUnique.mockReset();
    mockPrisma.tenantClient.delete.mockReset();
  });

  it('supprime le compte client sans historique', async () => {
    mockPrisma.tenantClient.findUnique.mockResolvedValue(client());
    await removeTenantClient('u1', 'ag1');
    expect(mockPrisma.tenantClient.delete).toHaveBeenCalledWith({
      where: { userId_tenantId: { userId: 'u1', tenantId: 'ag1' } }
    });
  });

  it.each([
    ['un bail', { primaryLeases: 1 }],
    ['un paiement de loyer', { rentalPayments: 2 }],
    ['un compte tiers', { thirdPartyAccounts: 1 }],
    ['un reversement', { ownerPayouts: 1 }],
    ['un mandat de vente', { saleMandatesAsSeller: 1 }]
  ])('refuse (409) avec %s, sans rien supprimer', async (_nom, compteurs) => {
    mockPrisma.tenantClient.findUnique.mockResolvedValue(client(compteurs));
    await expect(removeTenantClient('u1', 'ag1')).rejects.toBeInstanceOf(ConflictError);
    expect(mockPrisma.tenantClient.delete).not.toHaveBeenCalled();
  });

  it('refuse (409) avec des conditions de gestion propriétaire', async () => {
    mockPrisma.tenantClient.findUnique.mockResolvedValue(client({}, { id: 'mt1' }));
    await expect(removeTenantClient('u1', 'ag1')).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.tenantClient.delete).not.toHaveBeenCalled();
  });

  it('NotFoundError si le compte client n’existe pas', async () => {
    mockPrisma.tenantClient.findUnique.mockResolvedValue(null);
    await expect(removeTenantClient('u1', 'ag1')).rejects.toBeInstanceOf(NotFoundError);
    expect(mockPrisma.tenantClient.delete).not.toHaveBeenCalled();
  });
});
