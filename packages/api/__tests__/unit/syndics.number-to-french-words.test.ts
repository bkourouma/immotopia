/**
 * Lot S3 — montants en toutes lettres (reçus et quittances de charges).
 */

import { amountToFrenchWords, integerToFrenchWords } from '../../src/lib/syndics/number-to-french-words';

describe('integerToFrenchWords', () => {
  it.each([
    [0, 'zéro'],
    [1, 'un'],
    [16, 'seize'],
    [17, 'dix-sept'],
    [21, 'vingt et un'],
    [22, 'vingt-deux'],
    [70, 'soixante-dix'],
    [71, 'soixante et onze'],
    [77, 'soixante-dix-sept'],
    [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'],
    [91, 'quatre-vingt-onze'],
    [99, 'quatre-vingt-dix-neuf'],
    [100, 'cent'],
    [101, 'cent un'],
    [180, 'cent quatre-vingts'],
    [200, 'deux cents'],
    [201, 'deux cent un'],
    [1000, 'mille'],
    [1001, 'mille un'],
    [2000, 'deux mille'],
    [80000, 'quatre-vingt mille'],
    [200000, 'deux cent mille'],
    [1000000, 'un million'],
    [2500001, 'deux millions cinq cent mille un'],
    [200000000, 'deux cents millions'],
    [1000000000, 'un milliard']
  ])('%d -> %s', (value, words) => {
    expect(integerToFrenchWords(value)).toBe(words);
  });

  it('refuse un nombre negatif, decimal ou trop grand', () => {
    expect(() => integerToFrenchWords(-1)).toThrow(RangeError);
    expect(() => integerToFrenchWords(1.5)).toThrow(RangeError);
    expect(() => integerToFrenchWords(1e12)).toThrow(RangeError);
  });
});

describe('amountToFrenchWords', () => {
  it('ajoute la devise, au singulier ou au pluriel', () => {
    expect(amountToFrenchWords(1, 'XOF')).toBe('un franc CFA');
    expect(amountToFrenchWords(2500, 'XOF')).toBe('deux mille cinq cents francs CFA');
    expect(amountToFrenchWords(0, 'EUR')).toBe('zéro euro');
  });

  it('« de » apres un million ou un milliard sans rien derriere', () => {
    expect(amountToFrenchWords(1000000, 'XOF')).toBe('un million de francs CFA');
    expect(amountToFrenchWords(2000000, 'EUR')).toBe("deux millions d'euros");
    expect(amountToFrenchWords(1000001, 'XOF')).toBe('un million un francs CFA');
  });

  it('exprime les decimales en centimes, arrondies au centime', () => {
    expect(amountToFrenchWords(12.5, 'EUR')).toBe('douze euros et cinquante centimes');
    expect(amountToFrenchWords(1.01, 'EUR')).toBe('un euro et un centime');
    expect(amountToFrenchWords(10.999, 'XOF')).toBe('onze francs CFA');
  });

  it('garde le code d une devise inconnue', () => {
    expect(amountToFrenchWords(3, 'GHS')).toBe('trois GHS');
  });
});
