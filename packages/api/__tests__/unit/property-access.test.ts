/**
 * `getPropertyById` refuse un bien d'une autre agence, quel que soit son type.
 *
 * Seuls les biens `TENANT` etaient controles : un bien `CLIENT` d'une agence B
 * se lisait, se modifiait et se supprimait depuis l'agence A, pour peu qu'on en
 * connaisse l'identifiant (`updateProperty` et `deleteProperty` passent par
 * cette fonction).
 */

const propertyFindUnique = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: { findUnique: (...a: any[]) => propertyFindUnique(...a) }
  }
}));

// Le moteur de gabarits porte des erreurs de typage anciennes que ts-jest
// refuse ; il ne sert pas a `getPropertyById`.
jest.mock('../../src/services/property-template-service', () => ({ validatePropertyData: jest.fn() }));

import { getPropertyById } from '../../src/services/property-service';

function bien(overrides: Record<string, unknown>) {
  return {
    id: 'p1',
    ownershipType: 'TENANT',
    tenantId: 'tenant-B',
    ownerUserId: 'owner-1',
    isPublished: false,
    mandates: [],
    ...overrides
  };
}

beforeEach(() => jest.clearAllMocks());

describe('getPropertyById — isolation par agence', () => {
  it.each(['TENANT', 'CLIENT', 'PUBLIC'])("refuse un bien %s d'une autre agence", async ownershipType => {
    propertyFindUnique.mockResolvedValue(bien({ ownershipType }));

    await expect(getPropertyById('p1', 'tenant-A', 'user-A')).resolves.toBeNull();
  });

  it('rend un bien de sa propre agence, sans les mandats utilises pour le controle', async () => {
    propertyFindUnique.mockResolvedValue(bien({ ownershipType: 'CLIENT', tenantId: 'tenant-A' }));

    const property = await getPropertyById('p1', 'tenant-A', 'user-A');

    expect(property?.id).toBe('p1');
    expect(property).not.toHaveProperty('mandates');
  });

  it("rend un bien d'une autre agence quand l'agence detient un mandat actif", async () => {
    propertyFindUnique.mockResolvedValue(bien({ ownershipType: 'CLIENT', mandates: [{ tenantId: 'tenant-A' }] }));

    await expect(getPropertyById('p1', 'tenant-A', 'user-A')).resolves.not.toBeNull();
  });

  it('hors agence, un bien PUBLIC publie reste visible, un bien CLIENT non', async () => {
    propertyFindUnique.mockResolvedValue(bien({ ownershipType: 'PUBLIC', tenantId: null, isPublished: true }));
    await expect(getPropertyById('p1', null, 'user-X')).resolves.not.toBeNull();

    propertyFindUnique.mockResolvedValue(bien({ ownershipType: 'CLIENT' }));
    await expect(getPropertyById('p1', null, 'user-X')).resolves.toBeNull();
  });
});
