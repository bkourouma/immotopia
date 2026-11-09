import { amountToArabicWords, integerToArabicWords } from '../../src/lib/syndics/number-to-arabic-words';

describe('integerToArabicWords', () => {
  it.each([
    [0, 'صفر'],
    [1, 'واحد'],
    [11, 'أحد عشر'],
    [21, 'واحد وعشرون'],
    [99, 'تسعة وتسعون'],
    [100, 'مئة'],
    [201, 'مئتان وواحد'],
    [1_000, 'ألف'],
    [2_000, 'ألفان'],
    [3_000, 'ثلاثة آلاف'],
    [11_000, 'أحد عشر ألفًا'],
    [101_000, 'مئة ألف وألف'],
    [200_000, 'مئتا ألف'],
    [201_000, 'مئتا ألف وألف'],
    [1_000_000, 'مليون'],
    [2_000_000_001, 'ملياران وواحد']
  ])('%d -> %s', (value, expected) => {
    expect(integerToArabicWords(value)).toBe(expected);
  });

  it('refuse les nombres négatifs, fractionnaires, non finis et hors borne', () => {
    for (const value of [-1, 1.5, Infinity, NaN, 1_000_000_000_000]) {
      expect(() => integerToArabicWords(value)).toThrow(RangeError);
    }
  });
});

describe('amountToArabicWords', () => {
  it('rend le montant XOF entièrement en arabe, centimes compris', () => {
    const words = amountToArabicWords(2_501.25, 'XOF');
    expect(words).toBe('ألفان وخمسمئة وواحد فرنك غرب أفريقيا وخمسة وعشرون سنتيمًا');
    expect(words).not.toMatch(/[A-Za-z]/);
  });

  it('gère zéro, arrondi et autres devises connues', () => {
    expect(amountToArabicWords(0, 'XOF')).toBe('صفر فرنك غرب أفريقيا');
    expect(amountToArabicWords(10.999, 'XOF')).toBe('أحد عشر فرنك غرب أفريقيا');
    expect(amountToArabicWords(1.01, 'EUR')).toBe('واحد يورو وسنت واحد');
    expect(amountToArabicWords(0.02, 'EUR')).toBe('صفر يورو وسنتان');
    expect(amountToArabicWords(3, 'GHS')).toBe('ثلاثة GHS');
    expect(amountToArabicWords(2_000, 'XOF')).toBe('ألفا فرنك غرب أفريقيا');
    expect(amountToArabicWords(2_000_000, 'XOF')).toBe('مليونا فرنك غرب أفريقيا');
    expect(amountToArabicWords(20_000, 'XOF')).toBe('عشرون ألف فرنك غرب أفريقيا');
  });

  it('refuse les signes négatifs, les non finis et le débordement après arrondi', () => {
    for (const value of [-0.01, Infinity, NaN, 999_999_999_999.999]) {
      expect(() => amountToArabicWords(value, 'XOF')).toThrow(RangeError);
    }
  });
});
