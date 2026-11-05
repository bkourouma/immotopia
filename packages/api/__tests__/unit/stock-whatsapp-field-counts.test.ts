/**
 * Comptages terrain : normalisation de la recherche (sans casse ni accents).
 * Le comportement de bout en bout est couvert par api/finance.stock-whatsapp.test.ts.
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));

import { normalizeSearch } from '../../src/lib/stock-whatsapp/admin/field-counts';
import { fieldCountsQuerySchema } from '../../src/lib/stock-whatsapp/admin/schemas';

describe('normalizeSearch', () => {
  it('ignore la casse et les accents', () => {
    expect(normalizeSearch('Béton')).toBe('beton');
    expect(normalizeSearch('BETON')).toBe('beton');
    expect(normalizeSearch('Ciment')).toBe(normalizeSearch('ciment'));
    expect(normalizeSearch('Koné Élodie')).toBe('kone elodie');
  });

  it('une aiguille sans accent est sous-chaîne du libellé normalisé', () => {
    expect(normalizeSearch('Béton armé').includes(normalizeSearch('beton'))).toBe(true);
    expect(normalizeSearch('Béton armé').includes(normalizeSearch('ARMÉ'))).toBe(true);
  });

  it('rogne les espaces', () => {
    expect(normalizeSearch('  ciment ')).toBe('ciment');
    expect(normalizeSearch('   ')).toBe('');
  });
});

describe('fieldCountsQuerySchema.search', () => {
  it('est facultatif et rogné', () => {
    expect(fieldCountsQuerySchema.parse({}).search).toBeUndefined();
    expect(fieldCountsQuerySchema.parse({ search: '  ciment ' }).search).toBe('ciment');
  });

  it('refuse plus de 120 caractères', () => {
    expect(fieldCountsQuerySchema.safeParse({ search: 'a'.repeat(120) }).success).toBe(true);
    const result = fieldCountsQuerySchema.safeParse({ search: 'a'.repeat(121) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('La recherche compte au plus 120 caractères.');
  });
});
