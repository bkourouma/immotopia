import {
  hasPreviousOtherOwner,
  resolveVisibleSince,
  utcDayNumber,
  type LotOwnerProfileHistoryRow
} from '../../src/lib/syndics/lot-owner-history';

const d = (day: string) => new Date(`${day}T00:00:00.000Z`);

const profile = (
  contactId: string,
  ownedSince: Date,
  extra: Partial<Pick<LotOwnerProfileHistoryRow, 'ownedUntil' | 'isActive'>> = {}
): LotOwnerProfileHistoryRow => ({ contactId, ownedSince, ownedUntil: null, isActive: true, ...extra });

describe('lot-owner-history', () => {
  describe('utcDayNumber', () => {
    it('ignore l’heure : même jour calendaire UTC', () => {
      expect(utcDayNumber(new Date('2026-07-01T00:00:00.000Z'))).toBe(
        utcDayNumber(new Date('2026-07-01T23:59:59.999Z'))
      );
      expect(utcDayNumber(d('2026-07-02'))).toBe(utcDayNumber(d('2026-07-01')) + 1);
    });
  });

  describe('resolveVisibleSince', () => {
    it('propriétaire unique : aucune borne', () => {
      const profiles = [profile('awa', d('2026-10-18'))];
      expect(resolveVisibleSince(d('2026-10-18'), ['awa'], profiles)).toBeNull();
      expect(hasPreviousOtherOwner(d('2026-10-18'), ['awa'], profiles)).toBe(false);
    });

    it('vrai changement de propriétaire (ancien jusqu’au 30/06, nouveau depuis le 01/07) : borne = 01/07', () => {
      const profiles = [
        profile('ancien', d('2020-01-01'), { ownedUntil: d('2026-06-30') }),
        profile('nouveau', d('2026-07-01'))
      ];
      expect(resolveVisibleSince(d('2026-07-01'), ['nouveau'], profiles)).toEqual(d('2026-07-01'));
      expect(hasPreviousOtherOwner(d('2026-07-01'), ['nouveau'], profiles)).toBe(true);
    });

    it('ancien propriétaire dont la fin est le jour même du début du nouveau : borne', () => {
      const profiles = [
        profile('ancien', d('2020-01-01'), { ownedUntil: d('2026-07-01') }),
        profile('nouveau', d('2026-07-01'))
      ];
      expect(resolveVisibleSince(d('2026-07-01'), ['nouveau'], profiles)).toEqual(d('2026-07-01'));
    });

    it('indivision : co-indivisaire encore propriétaire depuis 2020, nouveau depuis aujourd’hui : aucune borne', () => {
      const profiles = [profile('depuis-2020', d('2020-01-01')), profile('aujourdhui', d('2026-10-18'))];
      expect(resolveVisibleSince(d('2026-10-18'), ['aujourdhui'], profiles)).toBeNull();
      expect(hasPreviousOtherOwner(d('2026-10-18'), ['aujourdhui'], profiles)).toBe(false);
    });

    it('co-indivisaire dont la fin est postérieure au début du profil courant : pas un ancien propriétaire', () => {
      const profiles = [
        profile('sortant', d('2020-01-01'), { ownedUntil: d('2026-12-31') }),
        profile('courant', d('2026-07-01'))
      ];
      expect(resolveVisibleSince(d('2026-07-01'), ['courant'], profiles)).toBeNull();
    });

    it('profil inactif (clos sans date de fin) d’un autre contact commencé avant : ancien propriétaire', () => {
      const profiles = [
        profile('ancien-desactive', d('2018-03-01'), { isActive: false }),
        profile('nouveau', d('2026-07-01'))
      ];
      expect(hasPreviousOtherOwner(d('2026-07-01'), new Set(['nouveau']), profiles)).toBe(true);
    });

    it('profil inactif commencé le même jour ou après : pas un ancien propriétaire', () => {
      const profiles = [profile('erreur', d('2026-07-01'), { isActive: false }), profile('nouveau', d('2026-07-01'))];
      expect(resolveVisibleSince(d('2026-07-01'), ['nouveau'], profiles)).toBeNull();
    });

    it('les contacts liés au même compte sont ignorés, même clos', () => {
      const profiles = [
        profile('fiche-1', d('2020-01-01'), { ownedUntil: d('2026-06-30') }),
        profile('fiche-2', d('2026-07-01'))
      ];
      expect(resolveVisibleSince(d('2026-07-01'), ['fiche-1', 'fiche-2'], profiles)).toBeNull();
    });

    it('lot sans historique : aucune borne', () => {
      expect(resolveVisibleSince(d('2026-07-01'), ['awa'], [])).toBeNull();
    });
  });
});
