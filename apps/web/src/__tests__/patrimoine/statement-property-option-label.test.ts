import '../../i18n';
import { describe, expect, it } from 'vitest';
import { propertyOptionLabel } from '../../pages/patrimoine/statements/OwnerStatementsPage';

describe('propertyOptionLabel (BUG-2026-11-03-028)', () => {
  it('distingue deux biens de même titre par référence et adresse', () => {
    const a = propertyOptionLabel({
      title: 'Appartement F3',
      internalReference: 'BIEN-0012',
      address: 'Cocody, Abidjan'
    });
    const b = propertyOptionLabel({ title: 'Appartement F3', internalReference: 'BIEN-0047', address: 'Marcory' });
    expect(a).toBe('Appartement F3 — BIEN-0012 · Cocody, Abidjan');
    expect(a).not.toBe(b);
  });

  it('se contente du titre sans complément', () => {
    expect(propertyOptionLabel({ title: 'Villa', internalReference: null, address: ' ' })).toBe('Villa');
  });
});
