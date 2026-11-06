/**
 * Recette gestion locative 06 (GL-06-005) : un montant hors de la colonne
 * décimale (12 chiffres, 2 décimales) est refusé en 400 par le schéma, au lieu
 * de produire une 500 à l'écriture en base.
 */
import { createPaymentSchema } from '../../src/lib/rental/payment-schemas';

const base = { method: 'CASH' as const };

describe('createPaymentSchema — borne du montant', () => {
  it('accepte un montant courant', () => {
    expect(createPaymentSchema.safeParse({ ...base, amount: 150000 }).success).toBe(true);
  });

  it('accepte le plus grand montant que la colonne sait porter', () => {
    expect(createPaymentSchema.safeParse({ ...base, amount: 9_999_999_999.99 }).success).toBe(true);
  });

  it('refuse 10 000 000 000 avec un message clair', () => {
    const result = createPaymentSchema.safeParse({ ...base, amount: 10_000_000_000 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['amount']);
      expect(result.error.issues[0].message).toContain('dépasse');
    }
  });
});
