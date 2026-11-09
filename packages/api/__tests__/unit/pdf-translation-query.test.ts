import { pdfTranslationQuery } from '../../src/lib/documents/pdf-translation-query';

describe('pdfTranslationQuery', () => {
  it('sert l’original sans paramètre et la copie uniquement pour ar', () => {
    expect(pdfTranslationQuery(undefined)).toBeUndefined();
    expect(pdfTranslationQuery('ar')).toBe('ar');
  });

  it.each(['fr', 'en', '', ['ar'], { language: 'ar' }])('rejette translation=%p', value => {
    expect(() => pdfTranslationQuery(value)).toThrow('Paramètre de traduction invalide.');
  });
});
