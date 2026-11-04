/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `listLeases` : la recherche couvre le numéro du bail, le bien (titre, adresse,
 * référence) et le locataire principal (nom, e-mail), sans casse, et reste
 * bornée à l'agence.
 */
const mockPrisma: any = {
  rentalLease: {
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0)
  }
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => mockPrisma[prop as string] })
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/lot-registry-service', () => ({ syncLotActivationsTx: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));
jest.mock('../../src/services/email-notification-config-service', () => ({ getEmailNotificationConfig: jest.fn() }));
jest.mock('../../src/services/tenant-service', () => ({ getTenantById: jest.fn() }));
jest.mock('../../src/services/own-assets-barrier-service', () => ({ assertThirdPartyAllowedForTenant: jest.fn() }));
jest.mock('../../src/services/property-status-service', () => ({
  updatePropertyStatus: jest.fn(),
  validateStatusTransition: jest.fn()
}));

import { listLeases } from '../../src/services/rental-lease-service';

beforeEach(() => jest.clearAllMocks());

describe('listLeases — recherche', () => {
  it('cherche le numéro, le bien et le locataire, sans casse, dans la seule agence', async () => {
    await listLeases('tenant-A', { search: '  Cocody ' });

    const where = mockPrisma.rentalLease.findMany.mock.calls[0][0].where;
    expect(where.tenant_id).toBe('tenant-A');
    const contient = { contains: 'Cocody', mode: 'insensitive' };
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { lease_number: contient },
        { property: { title: contient } },
        { property: { address: contient } },
        { primaryRenter: { user: { fullName: contient } } }
      ])
    );
    // Le compteur de pagination utilise le même filtre, tenant compris.
    expect(mockPrisma.rentalLease.count.mock.calls[0][0].where).toBe(where);
  });

  it('sans recherche (ou recherche vide), aucun filtre OR', async () => {
    await listLeases('tenant-A', { search: '   ' });
    expect(mockPrisma.rentalLease.findMany.mock.calls[0][0].where).toEqual({ tenant_id: 'tenant-A' });
  });
});
