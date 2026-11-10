/**
 * F4 (contre-audit de la PR #205) : inventaire LECTURE SEULE des liaisons
 * croisées entre agences écrites avant les correctifs. Seuls des identifiants
 * sortent ; aucune écriture n'est possible (le faux client n'en expose pas).
 */
const prismaMock: any = {
  property: { findMany: jest.fn() },
  syndicateLot: { findMany: jest.fn() },
  membership: { findMany: jest.fn() },
  tenantClient: { findMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock, disconnectDatabase: jest.fn() }));

import {
  formatReport,
  listContainerParentLinks,
  listCrossTenantLinks,
  listPropertyOwnerLinks,
  listSyndicateLotPropertyLinks
} from '../../src/scripts/list-cross-tenant-links';

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.property.findMany.mockResolvedValue([]);
  prismaMock.syndicateLot.findMany.mockResolvedValue([]);
  prismaMock.membership.findMany.mockResolvedValue([]);
  prismaMock.tenantClient.findMany.mockResolvedValue([]);
});

describe('listContainerParentLinks', () => {
  it("liste un enfant rattaché à l'immeuble d'une autre agence sans mandat actif", async () => {
    prismaMock.property.findMany.mockResolvedValueOnce([
      // Même agence : ignoré.
      { id: 'c1', tenantId: 'A', containerParent: { id: 'p1', tenantId: 'A', mandates: [] } },
      // Autre agence, mandat actif de l'agence de l'enfant : ignoré.
      { id: 'c2', tenantId: 'A', containerParent: { id: 'p2', tenantId: 'B', mandates: [{ tenantId: 'A' }] } },
      // Autre agence, sans mandat : listé.
      { id: 'c3', tenantId: 'A', containerParent: { id: 'p3', tenantId: 'B', mandates: [{ tenantId: 'C' }] } }
    ]);
    const links = await listContainerParentLinks(prismaMock);
    expect(links).toEqual([{ kind: 'CONTAINER_PARENT', id: 'c3', relatedId: 'p3', tenantIds: ['A', 'B'] }]);
    const args = prismaMock.property.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ containerParentId: { not: null } });
    expect(args.select.containerParent.select.mandates).toEqual({
      where: { isActive: true },
      select: { tenantId: true }
    });
  });

  it('pagine par curseur jusqu’à une page incomplète', async () => {
    const page = Array.from({ length: 500 }, (_, i) => ({
      id: `c${String(i).padStart(3, '0')}`,
      tenantId: 'A',
      containerParent: { id: 'p', tenantId: 'A', mandates: [] }
    }));
    prismaMock.property.findMany.mockResolvedValueOnce(page).mockResolvedValueOnce([]);
    await listContainerParentLinks(prismaMock);
    expect(prismaMock.property.findMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.property.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: 'c499' }, skip: 1, take: 500 });
  });
});

describe('listSyndicateLotPropertyLinks', () => {
  it("liste un lot lié au bien d'une autre agence que la copropriété", async () => {
    prismaMock.syndicateLot.findMany.mockResolvedValueOnce([
      { id: 'l1', syndicate: { tenantId: 'A' }, property: { id: 'b1', tenantId: 'A' } },
      { id: 'l2', syndicate: { tenantId: 'A' }, property: { id: 'b2', tenantId: 'B' } }
    ]);
    await expect(listSyndicateLotPropertyLinks(prismaMock)).resolves.toEqual([
      { kind: 'SYNDICATE_LOT_PROPERTY', id: 'l2', relatedId: 'b2', tenantIds: ['A', 'B'] }
    ]);
  });
});

describe('listPropertyOwnerLinks', () => {
  it("liste un bien dont le propriétaire n'est ni membre actif ni client de l'agence", async () => {
    prismaMock.property.findMany.mockResolvedValueOnce([
      { id: 'b1', tenantId: 'A', ownerUserId: 'u-membre' },
      { id: 'b2', tenantId: 'A', ownerUserId: 'u-client' },
      { id: 'b3', tenantId: 'A', ownerUserId: 'u-etranger' }
    ]);
    prismaMock.membership.findMany.mockResolvedValueOnce([{ userId: 'u-membre', tenantId: 'A' }]);
    prismaMock.tenantClient.findMany.mockResolvedValueOnce([{ userId: 'u-client', tenantId: 'A' }]);
    await expect(listPropertyOwnerLinks(prismaMock)).resolves.toEqual([
      { kind: 'PROPERTY_OWNER', id: 'b3', relatedId: 'u-etranger', tenantIds: ['A'] }
    ]);
    expect(prismaMock.membership.findMany.mock.calls[0][0].where.status).toBe('ACTIVE');
  });
});

describe('rapport', () => {
  it('ne contient que des identifiants et des totaux par famille', async () => {
    prismaMock.syndicateLot.findMany.mockResolvedValueOnce([
      { id: 'l2', syndicate: { tenantId: 'A' }, property: { id: 'b2', tenantId: null } }
    ]);
    const lines = formatReport(await listCrossTenantLinks(prismaMock));
    expect(lines[0]).toBe('SYNDICATE_LOT_PROPERTY\tl2\tcible : b2\tagences : A -> (aucune)');
    expect(lines).toContain('Total SYNDICATE_LOT_PROPERTY : 1');
    expect(lines).toContain('Total CONTAINER_PARENT : 0');
    expect(lines[lines.length - 1]).toBe('Total : 1 liaison(s) croisée(s)');
  });

  it("n'appelle aucune méthode d'écriture", async () => {
    await listCrossTenantLinks(prismaMock);
    for (const model of Object.values(prismaMock) as any[]) {
      expect(Object.keys(model)).toEqual(['findMany']);
    }
  });
});
