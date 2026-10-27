import { maskPhone, normalizeIvorianMsisdn } from '../../src/lib/syndics/declared-payment/phone';

describe('normalizeIvorianMsisdn', () => {
  it.each([
    ['0707070707', '+2250707070707'],
    ['07 07 07 07 07', '+2250707070707'],
    ['+225 07 07 07 07 07', '+2250707070707'],
    ['+2250707070707', '+2250707070707'],
    ['00225 07.07.07.07.07', '+2250707070707'],
    ['2250707070707', '+2250707070707'],
    ['  05-44-33-22-11 ', '+2250544332211'],
    ['0102030405', '+2250102030405']
  ])('accepte %s', (input, expected) => {
    expect(normalizeIvorianMsisdn(input)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['07070707'], // ancien format à 8 chiffres
    ['070707070'], // trop court
    ['07070707070'], // trop long
    ['07 07 AB 07 07'],
    ['0707070707x'],
    ['0207070707'], // fixe
    ['2707070707'], // fixe
    ['0907070707'], // préfixe inconnu
    ['+33 6 12 34 56 78'],
    ['+2210707070707']
  ])('refuse %j', input => {
    expect(normalizeIvorianMsisdn(input)).toBeNull();
  });

  it('ne lève pas pour une entrée non textuelle', () => {
    expect(normalizeIvorianMsisdn(undefined as unknown as string)).toBeNull();
  });
});

describe('maskPhone', () => {
  it('masque le milieu du numéro national', () => {
    expect(maskPhone('+2250707070712')).toBe('07 •• •• •• 12');
  });

  it.each(['', 'abc', '+22507', undefined, null])('renvoie une chaîne masquée pour %j', input => {
    const masked = maskPhone(input as unknown as string);
    expect(masked).toBe('•• •• •• •• ••');
    expect(masked).not.toMatch(/\d/);
  });
});
