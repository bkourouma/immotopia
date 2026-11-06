import { describe, it, expect } from 'vitest';
import { deviseAffichee, codeDeviseIntl, formatMontantLocatif } from '../../lib/rental-labels';

/** `deviseAffichee` retirait la lettre « s » au lieu des espaces (`/s/g`). */
describe('deviseAffichee', () => {
  it.each(['F CFA', 'f cfa', ' CFA ', 'XOF', 'cfa', 'FCFA', '', null, undefined])('%j devient FCFA', valeur => {
    expect(deviseAffichee(valeur as string | null | undefined)).toBe('FCFA');
  });

  it('laisse les autres devises inchangées, lettre « s » comprise', () => {
    expect(deviseAffichee('EUR')).toBe('EUR');
    expect(deviseAffichee('USD')).toBe('USD');
    expect(deviseAffichee('MAD')).toBe('MAD');
  });

  it('codeDeviseIntl : F CFA donne XOF', () => {
    expect(codeDeviseIntl('F CFA')).toBe('XOF');
  });
});

describe('formatMontantLocatif (BUG-2026-11-04-055 et -060)', () => {
  const norm = (s: string) => s.replace(new RegExp('[\\s\\u00a0\\u202f]', 'g'), ' ');

  it.each([
    [0.01, 'XOF', '0,01 FCFA'],
    [1500.5, 'F CFA', '1 500,50 FCFA'],
    [150000, 'CFA', '150 000 FCFA'],
    [10000, 'FCFA', '10 000 FCFA'],
    ['30000', null, '30 000 FCFA']
  ])('%s %s -> %s', (montant, devise, attendu) => {
    expect(norm(formatMontantLocatif(montant, devise))).toBe(attendu);
  });

  it('laisse une autre devise telle quelle', () => {
    expect(norm(formatMontantLocatif(20, 'EUR'))).toBe('20 EUR');
  });
});
