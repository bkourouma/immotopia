/**
 * F3 (contre-audit de la PR #205) : le détail d'une copropriété n'expose plus
 * les unités de l'immeuble (`property.containerChildren`) en lignes Property
 * complètes et non filtrées : seulement celles de l'agence ou sous mandat
 * actif de l'agence (règle `childAccessWhere`), et seulement les champs
 * d'identification.
 */
const prismaMock: any = { syndicate: { findFirst: jest.fn() } };
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));

import { getSyndicateWithLotsAndStats } from '../../src/lib/syndics/queries';

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.syndicate.findFirst.mockResolvedValue(null);
});

describe('getSyndicateWithLotsAndStats : unités de l’immeuble cloisonnées', () => {
  it("filtre les enfants par agence ou mandat actif, et ne sélectionne que l'identification", async () => {
    await getSyndicateWithLotsAndStats('t1', 's1');
    const args = prismaMock.syndicate.findFirst.mock.calls[0][0];
    expect(args.where).toMatchObject({ id: 's1', tenantId: 't1' });
    const children = args.include.property.include.containerChildren;
    expect(children).not.toBe(true);
    expect(children.where).toEqual({
      OR: [{ tenantId: 't1' }, { mandates: { some: { tenantId: 't1', isActive: true } } }]
    });
    expect(children.select).toEqual({ id: true, internalReference: true, title: true, propertyType: true });
    expect(children.include).toBeUndefined();
  });

  it('le filtre suit l’agence demandée', async () => {
    await getSyndicateWithLotsAndStats('t2', 's1', { take: 5 });
    const children = prismaMock.syndicate.findFirst.mock.calls[0][0].include.property.include.containerChildren;
    expect(children.where.OR[0]).toEqual({ tenantId: 't2' });
  });
});
