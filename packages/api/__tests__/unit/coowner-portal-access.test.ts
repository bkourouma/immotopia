/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `requireCoOwnerPortalAccess` — ce que les tests HTTP
 * (`__tests__/api/syndics.coowner-portal.test.ts`) ne montrent pas : le
 * contexte d'agence posé pour le garde-fou Prisma (D1), visible en aval après
 * un `await`, et la liste des agences disponibles pour le sélecteur (B3 d).
 */

import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import { requireCoOwnerPortalAccess } from '../../src/middleware/coowner-portal-access';
import { getCurrentTenantId } from '../../src/utils/tenant-context';
import { readCoOwnerContactIds } from '../../src/lib/syndics/coowner-portal';

function seed() {
  mockPrisma.reset();
  mockPrisma.tenant.rows.push({ id: 'tenant-a', status: 'ACTIVE' }, { id: 'tenant-b', status: 'ACTIVE' });
  mockPrisma.user.rows.push({ id: 'user-1', isActive: true });
  mockPrisma.tenantClient.rows.push(
    // Plus ancien, mais sans lien de copropriété : un simple locataire.
    { id: 'tc-renter', userId: 'user-1', tenantId: 'tenant-b', createdAt: new Date('2025-01-01'), details: {} },
    {
      id: 'tc-coowner',
      userId: 'user-1',
      tenantId: 'tenant-a',
      createdAt: new Date('2026-01-01'),
      details: { syndicCoOwnerContactIds: ['contact-1'] }
    }
  );
  mockPrisma.crmContact.rows.push({ id: 'contact-1', tenantId: 'tenant-a' });
  mockPrisma.syndicate.rows.push({ id: 'syndic-1', tenantId: 'tenant-a' });
  mockPrisma.syndicateLot.rows.push({ id: 'lot-1', syndicateId: 'syndic-1' });
  mockPrisma.lotOwnerProfile.rows.push({
    id: 'p-1',
    lotId: 'lot-1',
    contactId: 'contact-1',
    ownershipPercentage: 50,
    ownedSince: new Date('2025-06-01'),
    ownedUntil: null,
    isActive: true,
    portalAccessEnabled: true,
    createdAt: new Date('2026-01-01')
  });
}

beforeEach(seed);

describe('requireCoOwnerPortalAccess', () => {
  it("pose le contexte d'agence, encore visible en aval après un await (D1)", async () => {
    let seen: string | undefined = 'PAS_APPELE';
    let done!: () => void;
    const finished = new Promise<void>(resolve => {
      done = resolve;
    });
    const next = jest.fn((error?: unknown) => {
      if (error) throw error;
      void Promise.resolve()
        .then(() => new Promise(resolve => setTimeout(resolve, 0)))
        .then(() => {
          seen = getCurrentTenantId();
          done();
        });
    });
    const req: any = { user: { userId: 'user-1' }, headers: {} };

    await requireCoOwnerPortalAccess(req, {} as any, next);
    await finished;

    expect(seen).toBe('tenant-a');
    expect(req.coOwnerPortal.scope).toMatchObject({
      tenantId: 'tenant-a',
      contactIds: ['contact-1'],
      lotIds: ['lot-1'],
      syndicateIds: ['syndic-1']
    });
    expect(req.coOwnerPortal.scope.lots[0].ownershipPercentage).toBe(50);
    // Seules les agences où le compte est copropriétaire sont proposées.
    expect(req.coOwnerPortal.availableTenantIds).toEqual(['tenant-a']);
  });

  it("un profil dont la détention est close n'ouvre plus rien", async () => {
    mockPrisma.lotOwnerProfile.rows[0].ownedUntil = new Date('2020-01-01');
    const next = jest.fn();
    await requireCoOwnerPortalAccess({ user: { userId: 'user-1' }, headers: {} } as any, {} as any, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('expose le début de détention de chaque lot (audit S5)', async () => {
    const req: any = { user: { userId: 'user-1' }, headers: {} };
    await requireCoOwnerPortalAccess(req, {} as any, jest.fn());
    expect(req.coOwnerPortal.scope.lots[0].ownedSince).toEqual(new Date('2025-06-01'));
  });

  it("une détention qui n'a pas encore commencé n'ouvre rien", async () => {
    mockPrisma.lotOwnerProfile.rows[0].ownedSince = new Date('2099-01-01');
    const next = jest.fn();
    await requireCoOwnerPortalAccess({ user: { userId: 'user-1' }, headers: {} } as any, {} as any, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('compte désactivé ou introuvable : 403, même avec une session valide', async () => {
    mockPrisma.user.rows[0].isActive = false;
    const inactive = jest.fn();
    await requireCoOwnerPortalAccess({ user: { userId: 'user-1' }, headers: {} } as any, {} as any, inactive);
    expect(inactive).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));

    const unknown = jest.fn();
    await requireCoOwnerPortalAccess({ user: { userId: 'user-inconnu' }, headers: {} } as any, {} as any, unknown);
    expect(unknown).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('sans session : 401', async () => {
    const next = jest.fn();
    await requireCoOwnerPortalAccess({ headers: {} } as any, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});

describe('readCoOwnerContactIds', () => {
  it('ne lève jamais sur un details inattendu, et dédoublonne', () => {
    expect(readCoOwnerContactIds(null)).toEqual([]);
    expect(readCoOwnerContactIds(['x'])).toEqual([]);
    expect(readCoOwnerContactIds({ syndicCoOwnerContactIds: 'x' })).toEqual([]);
    expect(readCoOwnerContactIds({ syndicCoOwnerContactIds: ['a', 'a', 3, '', 'b'] })).toEqual(['a', 'b']);
  });
});
