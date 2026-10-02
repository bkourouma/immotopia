import { createLotSchema, updateLotSchema } from '../../src/lib/syndics/schemas';

// Le schéma ne doit ni écarter ni écraser les tantièmes spéciaux et la date
// « Propriétaire depuis le » saisis sur l'écran des lots.
describe('schémas de lot : tantièmes spéciaux et propriétaire depuis', () => {
  const base = {
    syndicateId: '11111111-1111-4111-8111-111111111111',
    lotNumber: 'A101',
    lotType: 'APARTMENT',
    tantiemes: 150
  };

  it('création : conserve specialShares et convertit ownerSince en date', () => {
    const parsed = createLotSchema.parse({ ...base, specialShares: 250, ownerSince: '2019-03-15T00:00:00.000Z' });
    expect(parsed.specialShares).toBe(250);
    expect(parsed.ownerSince).toEqual(new Date('2019-03-15T00:00:00.000Z'));
  });

  it('création : sans saisie, specialShares reste absent (pas de valeur inventée)', () => {
    const parsed = createLotSchema.parse(base);
    expect(parsed.specialShares).toBeUndefined();
    expect(parsed.ownerSince).toBeUndefined();
  });

  it('modification : null est accepté et reste null', () => {
    const parsed = updateLotSchema.parse({ specialShares: null, ownerSince: null });
    expect(parsed.specialShares).toBeNull();
    expect(parsed.ownerSince).toBeNull();
  });

  it('refuse un tantième spécial nul, négatif ou décimal', () => {
    expect(() => createLotSchema.parse({ ...base, specialShares: 0 })).toThrow();
    expect(() => createLotSchema.parse({ ...base, specialShares: -5 })).toThrow();
    expect(() => updateLotSchema.parse({ specialShares: 2.5 })).toThrow();
  });
});
