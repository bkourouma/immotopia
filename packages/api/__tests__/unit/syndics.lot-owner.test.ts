/**
 * BUG-2026-09-30-087 : une seule regle de resolution du proprietaire d'un lot,
 * lue depuis ses profils proprietaires actuels (indivision comprise).
 */
import {
  formatLotOwners,
  pickPrimaryOwnerProfile,
  presentLotOwners,
  type OwnerProfileLike
} from '../../src/lib/syndics/lot-owner';

const profile = (id: string, last: string, pct: number, extra: Partial<OwnerProfileLike> = {}): OwnerProfileLike => ({
  id,
  contactId: `c-${id}`,
  ownershipPercentage: pct,
  ownedSince: '2021-07-02T00:00:00.000Z',
  isActive: true,
  contact: { firstName: 'Prénom', lastName: last },
  ...extra
});

describe("Proprietaire d'un lot (BUG-087)", () => {
  it('proprietaire unique a 100 % : son nom seul', () => {
    expect(formatLotOwners([profile('a', 'Kouadio', 100)])).toBe('Prénom Kouadio');
  });

  it('indivision 50/50 : « Nom 1 (50 %), Nom 2 (50 %) »', () => {
    expect(formatLotOwners([profile('a', 'Bamba', 50), profile('b', 'Traoré', 50)])).toBe(
      'Prénom Bamba (50 %), Prénom Traoré (50 %)'
    );
  });

  it('principal = plus forte part ; a part egale le plus ancien', () => {
    const big = profile('a', 'Bamba', 60);
    const small = profile('b', 'Traoré', 40);
    expect(pickPrimaryOwnerProfile([small, big])?.id).toBe('a');
    const older = profile('c', 'X', 50, { ownedSince: '2019-01-01T00:00:00.000Z' });
    expect(pickPrimaryOwnerProfile([profile('d', 'Y', 50), older])?.id).toBe('c');
  });

  it('ignore les profils inactifs ou termines', () => {
    const presented = presentLotOwners([
      profile('a', 'Actif', 100),
      profile('b', 'Inactif', 100, { isActive: false }),
      profile('c', 'Termine', 100, { ownedUntil: '2022-01-01T00:00:00.000Z' })
    ]);
    expect(presented.owners).toHaveLength(1);
    expect(presented.ownersLabel).toBe('Prénom Actif');
    expect(presentLotOwners([]).ownersLabel).toBe('');
  });
});
