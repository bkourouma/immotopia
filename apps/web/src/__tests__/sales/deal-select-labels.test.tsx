import { describe, it, expect } from 'vitest';
import { dealOptionLabel } from '../../pages/sales/selectors';

/** BUG-2026-09-30-073 — libellés lisibles pour « Affaire CRM d'origine ». */
describe('dealOptionLabel', () => {
  it('écrit type, étape, contact et montant en français, sans code brut', () => {
    const label = dealOptionLabel({
      type: 'ACHAT',
      stage: 'NEGOTIATION',
      contact: { firstName: 'Aminata', lastName: 'Coulibaly' },
      expectedValue: 48_000_000
    });
    expect(label).toContain('Aminata Coulibaly');
    expect(label).toMatch(/48\s?000\s?000/);
    expect(label).not.toMatch(/NEGOTIATION|ACHAT/);
  });

  it('reste lisible sans contact ni montant', () => {
    expect(dealOptionLabel({ type: 'VENTE', stage: 'NEW' })).not.toMatch(/NEW|VENTE|·/);
  });
});
