import {
  normalizeTransactionReference,
  TRANSACTION_REFERENCE_PATTERN
} from '../../src/lib/syndics/declared-payment/reference';

describe('normalizeTransactionReference', () => {
  it('retire les espaces et met en majuscules', () => {
    expect(normalizeTransactionReference('  cp 2610.17 abc  ')).toBe('CP2610.17ABC');
    expect(normalizeTransactionReference('mp-26\t10')).toBe('MP-2610');
  });

  it('accepte les bornes de longueur', () => {
    expect(normalizeTransactionReference('ABCD')).toBe('ABCD');
    expect(normalizeTransactionReference('A'.repeat(40))).toBe('A'.repeat(40));
  });

  it.each(['', 'abc', 'A'.repeat(41), 'AB_CD1', 'ÉTÉ1234', 'AB/CD12', 'REF#1234'])('refuse %j', input => {
    expect(normalizeTransactionReference(input)).toBeNull();
  });

  it('expose le motif', () => {
    expect(TRANSACTION_REFERENCE_PATTERN.test('CP.2610-17')).toBe(true);
    expect(TRANSACTION_REFERENCE_PATTERN.test('cp2610')).toBe(false);
  });

  it('ne lève pas pour une entrée non textuelle', () => {
    expect(normalizeTransactionReference(undefined as unknown as string)).toBeNull();
  });
});
