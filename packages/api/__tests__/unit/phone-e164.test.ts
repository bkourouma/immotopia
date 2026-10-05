/**
 * Numéros E.164 de l'inventaire par WhatsApp (spec 041, W3-R3) : une seule
 * normalisation, indicatif ivoirien par défaut, masquage partout ailleurs qu'à
 * l'inscription.
 */
import { maskPhone, normalizePhoneE164, waIdToE164 } from '../../src/lib/phone/e164';

describe('normalizePhoneE164', () => {
  it.each([
    ['07 12 34 56 78', '+2250712345678'],
    ['0712345678', '+2250712345678'],
    ['07.12.34.56.78', '+2250712345678'],
    ['07-12-34-56-78', '+2250712345678'],
    ['(07) 12 34 56 78', '+2250712345678'],
    ['  07 12 34 56 78  ', '+2250712345678'],
    ['+225 07 12 34 56 78', '+2250712345678'],
    ['+2250712345678', '+2250712345678'],
    ['00225 07 12 34 56 78', '+2250712345678'],
    ['002250712345678', '+2250712345678'],
    // Forme wa_id déjà internationale, sans « + » : pas de double indicatif.
    ['2250712345678', '+2250712345678'],
    ['221 77 123 45 67', '+221771234567'],
    ['+33 6 12 34 56 78', '+33612345678']
  ])('%s → %s', (raw, expected) => {
    expect(normalizePhoneE164(raw)).toBe(expected);
  });

  it('préfixe un autre indicatif par défaut quand il est donné', () => {
    expect(normalizePhoneE164('77 123 45 67', '221')).toBe('+221771234567');
  });

  it.each([
    [''],
    ['   '],
    ['12'],
    ['+1234567'], // 7 chiffres : trop court
    ['+1234567890123456'], // 16 chiffres : trop long
    ['07 12 34 56 7a'],
    ['+225 07 12 34 56 78 ext 4'],
    ['++2250712345678'],
    ['07+12345678'],
    ['x'.repeat(50)]
  ])('refuse %j', raw => {
    expect(normalizePhoneE164(raw)).toBeNull();
  });

  it('refuse un indicatif par défaut qui n’est pas fait de chiffres', () => {
    expect(normalizePhoneE164('0712345678', '+225')).toBeNull();
  });

  it('rend toujours la forme du CHECK SQL (+ puis 8 à 15 chiffres)', () => {
    for (const raw of ['07 12 34 56 78', '00225 0712345678', '+33612345678']) {
      expect(normalizePhoneE164(raw)).toMatch(/^\+[0-9]{8,15}$/);
    }
  });
});

describe('waIdToE164', () => {
  it('ajoute le « + » à un identifiant WhatsApp', () => {
    expect(waIdToE164('2250712345678')).toBe('+2250712345678');
  });

  it('n’ajoute aucun indicatif par défaut', () => {
    expect(waIdToE164('0712345678')).toBe('+0712345678');
  });

  it.each([[''], ['+2250712345678'], ['225 07'], ['1234567'], ['1234567890123456'], ['abc']])('refuse %j', waId => {
    expect(waIdToE164(waId)).toBeNull();
  });
});

describe('maskPhone', () => {
  it('masque un numéro ivoirien comme l’écran d’inscription', () => {
    expect(maskPhone('+2250712345678')).toBe('+225 07 •• •• •• 78');
  });

  it('ne laisse voir que l’indicatif et quatre chiffres', () => {
    const masked = maskPhone('+2250712345678');
    expect(masked).not.toContain('123456');
    expect(masked.replace(/[^0-9]/g, '')).toBe('2250778');
  });

  it('masque un numéro hors UEMOA', () => {
    const masked = maskPhone('+33612345678');
    expect(masked.startsWith('+')).toBe(true);
    expect(masked).not.toContain('234567');
    expect(masked.endsWith('78')).toBe(true);
  });

  it('ne révèle rien d’une valeur qui n’est pas en E.164', () => {
    expect(maskPhone('0712345678')).toBe('•• •• ••');
    expect(maskPhone('')).toBe('•• •• ••');
  });
});
