/**
 * BUG-2026-09-30-087 : une seule regle de resolution du proprietaire d'un lot,
 * lue depuis ses profils proprietaires actuels (indivision comprise).
 */
import {
  formatLotOwners,
  pickPrimaryOwnerProfile,
  presentLotOwners,
  presentSyndicateLots,
  summarizeLotPortalAccess,
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

describe("Acces au portail d'un lot", () => {
  const withPortal = (id: string, last: string, enabled: boolean, extra: Partial<OwnerProfileLike> = {}) =>
    profile(id, last, 50, { portalAccessEnabled: enabled, ...extra });

  it('NONE sans profil proprietaire actuel', () => {
    expect(summarizeLotPortalAccess([])).toEqual({ status: 'NONE', activeCount: 0, ownerCount: 0 });
    expect(summarizeLotPortalAccess([withPortal('a', 'X', true, { isActive: false })]).status).toBe('NONE');
  });

  it('ACTIVE quand tous les proprietaires actuels y ont acces, INACTIVE quand aucun', () => {
    expect(summarizeLotPortalAccess([withPortal('a', 'A', true), withPortal('b', 'B', true)])).toEqual({
      status: 'ACTIVE',
      activeCount: 2,
      ownerCount: 2
    });
    expect(summarizeLotPortalAccess([withPortal('a', 'A', false), withPortal('b', 'B', false)]).status).toBe(
      'INACTIVE'
    );
  });

  it("PARTIAL en indivision quand seuls certains y ont acces ; l'ancien proprietaire ne compte pas", () => {
    expect(summarizeLotPortalAccess([withPortal('a', 'A', true), withPortal('b', 'B', false)])).toEqual({
      status: 'PARTIAL',
      activeCount: 1,
      ownerCount: 2
    });
    const withFormerOwner = [
      withPortal('a', 'Actuel', false),
      withPortal('b', 'Ancien', true, { ownedUntil: '2022-01-01T00:00:00.000Z' })
    ];
    expect(summarizeLotPortalAccess(withFormerOwner).status).toBe('INACTIVE');
  });

  it('un champ non charge ne passe pas pour « inactif » dans presentLotOwners', () => {
    const [owner] = presentLotOwners([profile('a', 'Kouadio', 100)]).owners;
    expect(owner).not.toHaveProperty('portalAccessEnabled');
    const [loaded] = presentLotOwners([profile('a', 'Kouadio', 100, { portalAccessEnabled: true })]).owners;
    expect(loaded.portalAccessEnabled).toBe(true);
  });

  it('presentSyndicateLots remplace les profils bruts par owners, ownersLabel et portalAccess', () => {
    const [lot] = presentSyndicateLots([
      { id: 'lot-1', lotNumber: 'A-01', ownerProfiles: [profile('a', 'Kouadio', 100, { portalAccessEnabled: true })] }
    ]);
    expect(lot).not.toHaveProperty('ownerProfiles');
    expect(lot.ownersLabel).toBe('Prénom Kouadio');
    expect(lot.portalAccess).toEqual({ status: 'ACTIVE', activeCount: 1, ownerCount: 1 });
    const bare: { id: string; ownerProfiles?: OwnerProfileLike[] } = { id: 'lot-2' };
    expect(presentSyndicateLots([bare])[0].portalAccess.status).toBe('NONE');
  });
});
