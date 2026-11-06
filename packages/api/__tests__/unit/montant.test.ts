/**
 * Contrôle des deux décimales : un seul utilitaire, sans tolérance absolue qui
 * refuserait des montants valides proches du plafond.
 */
import { auPlusDeuxDecimales } from '../../src/utils/montant';
import { updatePenaltySchema } from '../../src/lib/rental/penalty-schemas';

describe('auPlusDeuxDecimales', () => {
  it.each([0, 1, 0.1, 12.5, 1234.56, 1234567890.12, 9999999999.99])('accepte %p', valeur => {
    expect(auPlusDeuxDecimales(valeur)).toBe(true);
  });

  it.each([1.234, 0.001, 9999999999.999, Number.NaN, Number.POSITIVE_INFINITY])('refuse %p', valeur => {
    expect(auPlusDeuxDecimales(valeur)).toBe(false);
  });
});

describe('schémas de montant — gros montants', () => {
  const montant = (amount: number) => updatePenaltySchema.safeParse({ amount, reason: 'Geste' }).success;

  it('accepte 1234567890.12 et 9999999999.99, refuse 1.234', () => {
    expect(montant(1234567890.12)).toBe(true);
    expect(montant(9999999999.99)).toBe(true);
    expect(montant(1.234)).toBe(false);
  });
});
