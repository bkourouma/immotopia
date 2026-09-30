/**
 * `createMandate` : le bien est lu filtré par agence. Bien d'une autre agence,
 * absent ou non CLIENT : le MÊME 404 (pas d'oracle 403/400) ; un bien CLIENT
 * sans agence n'est captable que par une agence déjà rattachée.
 */
const propertyFindFirst = jest.fn();
const tenantClientFindFirst = jest.fn();
const leaseFindFirst = jest.fn();
const transaction = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: { findFirst: (...a: any[]) => propertyFindFirst(...a), findUnique: jest.fn() },
    tenantClient: { findFirst: (...a: any[]) => tenantClientFindFirst(...a) },
    rentalLease: { findFirst: (...a: any[]) => leaseFindFirst(...a) },
    $transaction: (...a: any[]) => transaction(...a)
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/lot-registry-service', () => ({ syncLotActivationsTx: jest.fn() }));
jest.mock('../../src/services/own-assets-barrier-service', () => ({
  assertThirdPartyAllowedForTenant: jest.fn().mockResolvedValue(undefined)
}));

import { createMandate } from '../../src/services/property-mandate-service';
import { NotFoundError } from '../../src/middleware/error-middleware';

const data: any = { propertyId: 'p1', startDate: new Date('2026-10-01') };

beforeEach(() => {
  jest.clearAllMocks();
  tenantClientFindFirst.mockResolvedValue(null);
  leaseFindFirst.mockResolvedValue(null);
});

describe('createMandate — lecture du bien filtrée par agence', () => {
  it('filtre par agence (propre bien ou bien sans agence déjà sous mandat de l’agence)', async () => {
    propertyFindFirst.mockResolvedValue(null);
    await expect(createMandate('tenant-A', data)).rejects.toBeInstanceOf(NotFoundError);
    expect(propertyFindFirst.mock.calls[0][0].where).toMatchObject({
      id: 'p1',
      OR: [{ tenantId: 'tenant-A' }, { tenantId: null, mandates: { some: { tenantId: 'tenant-A' } } }]
    });
  });

  const refus = async (bien: any) => {
    propertyFindFirst.mockResolvedValue(bien);
    return createMandate('tenant-A', data).catch(e => e);
  };

  it('bien absent, étranger ou non CLIENT : même NotFoundError, même message', async () => {
    const absent = await refus(null);
    const nonClient = await refus({ id: 'p1', ownershipType: 'TENANT', tenantId: 'tenant-A', mandates: [] });
    expect(absent).toBeInstanceOf(NotFoundError);
    expect(nonClient).toBeInstanceOf(NotFoundError);
    expect(nonClient.message).toBe(absent.message);
  });

  it('bien CLIENT sans agence et sans rattachement préalable : 404, aucune écriture', async () => {
    const erreur = await refus({ id: 'p1', ownershipType: 'CLIENT', tenantId: null, ownerUserId: 'u1', mandates: [] });
    expect(erreur).toBeInstanceOf(NotFoundError);
    expect(tenantClientFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-A', userId: 'u1' } })
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('bien CLIENT sans agence dont le propriétaire est client de l’agence : passe la barrière', async () => {
    propertyFindFirst.mockResolvedValue({
      id: 'p1',
      ownershipType: 'CLIENT',
      tenantId: null,
      ownerUserId: 'u1',
      mandates: []
    });
    tenantClientFindFirst.mockResolvedValue({ id: 'c1' });
    transaction.mockResolvedValue({ id: 'm1' });
    await createMandate('tenant-A', data);
    expect(transaction).toHaveBeenCalled();
  });
});
