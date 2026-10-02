/**
 * Espace personnel : `getUserTenantMemberships` renvoie `tenant.type` (le web
 * choisit la navigation sans charger la fiche complete) et `updateTenant`
 * valide/normalise le telephone d'un PARTICULIER uniquement.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: Record<string, any> = {
  tenant: { findUnique: jest.fn(), update: jest.fn() },
  tenantClient: { findMany: jest.fn() },
  membership: { findMany: jest.fn() },
  $queryRaw: jest.fn(),
  // updateTenant ecrit dans une transaction (trace critique de suspension/activation).
  $transaction: jest.fn(async (cb: (tx: unknown) => unknown): Promise<unknown> => cb(mockPrisma))
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  recordAuditEvent: jest.fn(),
  AuditActionKey: {}
}));
jest.mock('../../src/middleware/session-invalidation', () => ({ revokeTenantSessions: jest.fn() }));

import { getUserTenantMemberships, updateTenant } from '../../src/services/tenant-service';

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.tenantClient.findMany.mockResolvedValue([]);
  mockPrisma.membership.findMany.mockResolvedValue([]);
  mockPrisma.tenant.update.mockImplementation(async ({ data }: any) => ({ id: 't1', ...data }));
});

describe('getUserTenantMemberships : tenant.type', () => {
  it('selectionne le type du tenant (et rien de sensible) pour les appartenances et les fiches client', async () => {
    await getUserTenantMemberships('u1');
    const expected = { select: { id: true, name: true, slug: true, type: true } };
    expect(mockPrisma.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { tenant: expected } })
    );
    expect(mockPrisma.tenantClient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { tenant: expected } })
    );
  });

  it('les replis SQL portent aussi le type', async () => {
    mockPrisma.tenantClient.findMany.mockRejectedValue(new Error('metadata'));
    mockPrisma.membership.findMany.mockRejectedValue(new Error('metadata'));
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([
        { id: 'c1', client_type: 'OWNER', tenant_id: 't1', tenant_name: 'A', tenant_slug: 'a', tenant_type: 'AGENCY' }
      ])
      .mockResolvedValueOnce([
        { id: 'm1', status: 'ACTIVE', tenant_id: 't2', tenant_name: 'B', tenant_slug: 'b', tenant_type: 'PARTICULIER' }
      ]);
    const result = await getUserTenantMemberships('u1');
    expect(result.asClient[0].tenant).toEqual({ id: 't1', name: 'A', slug: 'a', type: 'AGENCY' });
    expect(result.asMember[0].tenant).toEqual({ id: 't2', name: 'B', slug: 'b', type: 'PARTICULIER' });
  });
});

describe('updateTenant : contactPhone', () => {
  const particulier = { id: 't1', type: 'PARTICULIER', status: 'ACTIVE' };

  it('PARTICULIER : numero UEMOA valide, normalise avant ecriture', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(particulier);
    await updateTenant('t1', { contactPhone: ' +225 07 12-34.56 (78) ' });
    expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contactPhone: '+2250712345678' }) })
    );
  });

  it.each(['0712345678', '+33612345678', '+225abc', '+225123', '+22507123456789012', 'texte'])(
    'PARTICULIER : %s refuse en 422 avec le champ, rien n’est ecrit',
    async phone => {
      mockPrisma.tenant.findUnique.mockResolvedValue(particulier);
      await expect(updateTenant('t1', { contactPhone: phone })).rejects.toMatchObject({
        statusCode: 422,
        errors: [{ field: 'contactPhone', message: expect.stringContaining('Numéro de téléphone invalide') }]
      });
      expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
    }
  );

  it('PARTICULIER : sans telephone dans la requete ou telephone vide, aucune validation', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(particulier);
    await updateTenant('t1', { name: 'Nouveau nom' });
    await updateTenant('t1', { contactPhone: '' });
    expect(mockPrisma.tenant.update).toHaveBeenCalledTimes(2);
  });

  it.each(['AGENCY', 'OPERATOR', undefined])('type %s : telephone ecrit tel quel (inchange)', async type => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't1', type, status: 'ACTIVE' });
    await updateTenant('t1', { contactPhone: '0712345678' });
    expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contactPhone: '0712345678' }) })
    );
  });
});
