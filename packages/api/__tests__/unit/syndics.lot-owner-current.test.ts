import { pickPrimaryOwnerProfile, formatLotOwners } from '../../src/lib/syndics/lot-owner';

/** Un profil dont ownedSince est futur (vente en cours) n'est jamais proprietaire principal. */
describe('lot-owner : profil futur exclu', () => {
  const base = { ownedUntil: null, isActive: true };
  const future = {
    ...base,
    id: 'f',
    contactId: 'futur',
    ownershipPercentage: 100,
    ownedSince: new Date(Date.now() + 86400000)
  };
  const current = {
    ...base,
    id: 'c',
    contactId: 'actuel',
    ownershipPercentage: 40,
    ownedSince: new Date('2020-01-01')
  };

  it('choisit le profil actuel malgre une part plus forte a venir', () => {
    expect(pickPrimaryOwnerProfile([future, current])?.contactId).toBe('actuel');
  });

  it('aucun proprietaire si seul un profil futur existe', () => {
    expect(pickPrimaryOwnerProfile([future])).toBeNull();
    expect(formatLotOwners([future])).toBe('');
  });
});
