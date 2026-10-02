import { createPersonalSpaceSchema, isValidUemoaPhone } from '../../src/services/personal-space/schemas';
import { buildPersonalSpaceSlug } from '../../src/services/personal-space/create-personal-space';

/** Lot 4B : corps de POST /api/personal-space et slug non prévisible. */

describe('createPersonalSpaceSchema', () => {
  const valid = { displayName: 'Awa Traoré', country: 'CI' as const };

  it('accepte le corps minimal et rogne le nom', () => {
    expect(createPersonalSpaceSchema.parse({ ...valid, displayName: '  Awa Traoré  ' })).toEqual(valid);
  });

  it.each(['CI', 'SN', 'BF', 'ML', 'NE', 'TG', 'BJ', 'GW'])('accepte le pays UEMOA %s', country => {
    expect(createPersonalSpaceSchema.safeParse({ ...valid, country }).success).toBe(true);
  });

  it.each(['FR', 'GH', 'ci', '', undefined])('refuse le pays %s', country => {
    expect(createPersonalSpaceSchema.safeParse({ ...valid, country }).success).toBe(false);
  });

  it('refuse un champ inconnu (.strict) : userId, tenantId, type…', () => {
    for (const extra of [{ userId: 'u1' }, { tenantId: 't1' }, { type: 'AGENCY' }, { planKey: 'X' }]) {
      expect(createPersonalSpaceSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });

  it('refuse un nom vide, blanc, trop long ou contenant un caractère nul', () => {
    expect(createPersonalSpaceSchema.safeParse({ ...valid, displayName: '' }).success).toBe(false);
    expect(createPersonalSpaceSchema.safeParse({ ...valid, displayName: '   ' }).success).toBe(false);
    expect(createPersonalSpaceSchema.safeParse({ ...valid, displayName: 'a'.repeat(121) }).success).toBe(false);
    expect(createPersonalSpaceSchema.safeParse({ ...valid, displayName: 'a'.repeat(120) }).success).toBe(true);
    expect(createPersonalSpaceSchema.safeParse({ ...valid, displayName: 'Awa\u0000' }).success).toBe(false);
  });

  it('conserve un nom à balises tel quel (jamais interprété : l’API ne rend aucun HTML)', () => {
    const parsed = createPersonalSpaceSchema.parse({ ...valid, displayName: '<img src=x onerror=alert(1)>' });
    expect(parsed.displayName).toBe('<img src=x onerror=alert(1)>');
  });

  describe('phone', () => {
    it('accepte un numéro international UEMOA et le normalise', () => {
      expect(createPersonalSpaceSchema.parse({ ...valid, phone: '+225 07 12 34 56 78' }).phone).toBe('+2250712345678');
      expect(createPersonalSpaceSchema.parse({ ...valid, phone: '+221-77-123-45-67' }).phone).toBe('+221771234567');
    });

    it('phone est facultatif', () => {
      expect(createPersonalSpaceSchema.parse(valid).phone).toBeUndefined();
    });

    it.each([
      '0712345678',
      '+33612345678',
      '+22',
      '+2251234',
      '+225123456789012345',
      '00225 07 12 34 56',
      '+225abc45678',
      '',
      '+225 07 12 34 56 78; DROP'
    ])('refuse %s', phone => {
      expect(createPersonalSpaceSchema.safeParse({ ...valid, phone }).success).toBe(false);
    });

    it('borne les chiffres à 8..15 (indicatif compris)', () => {
      expect(isValidUemoaPhone('+2251234')).toBe(false); // 7 chiffres
      expect(isValidUemoaPhone('+22512345')).toBe(true); // 8 chiffres
      expect(isValidUemoaPhone(`+225${'1'.repeat(12)}`)).toBe(true); // 15 chiffres
      expect(isValidUemoaPhone(`+225${'1'.repeat(13)}`)).toBe(false); // 16 chiffres
    });
  });
});

describe('buildPersonalSpaceSlug', () => {
  it('dérive le slug du nom avec un suffixe aléatoire de 6 caractères', () => {
    expect(buildPersonalSpaceSlug('Awa Traoré')).toMatch(/^awa-traore-[a-z0-9]{6}$/);
  });

  it('n’est pas prévisible : deux appels donnent deux slugs', () => {
    const slugs = new Set(Array.from({ length: 50 }, () => buildPersonalSpaceSlug('Awa')));
    expect(slugs.size).toBe(50);
  });

  it('retombe sur « espace » quand le nom n’a aucun caractère exploitable, et borne la longueur', () => {
    expect(buildPersonalSpaceSlug('!!!')).toMatch(/^espace-[a-z0-9]{6}$/);
    expect(buildPersonalSpaceSlug('a'.repeat(120)).length).toBeLessThanOrEqual(47);
  });
});
