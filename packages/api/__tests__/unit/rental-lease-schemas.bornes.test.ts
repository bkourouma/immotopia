/**
 * BUG-2026-11-04-057 : un montant au-dessus de Decimal(12, 2) finissait en 500.
 * Les schémas de bail le refusent désormais en 400 (ZodError).
 */
import { createLeaseSchema, updateLeaseSchema } from '../../src/lib/rental/schemas';

const base = {
  propertyId: 'p1',
  primaryRenterClientId: 'c1',
  startDate: '2026-01-01T00:00:00.000Z'
};

describe('createLeaseSchema : plafonds', () => {
  it.each(['rentAmount', 'serviceChargeAmount', 'securityDepositAmount', 'penaltyFixedAmount', 'penaltyCapAmount'])(
    '%s au-dessus de 9 999 999 999,99 est refusé',
    champ => {
      const r = createLeaseSchema.safeParse({ ...base, [champ]: 99_999_999_999 });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues[0].path).toEqual([champ]);
        expect(r.error.issues[0].message).toContain('maximum autorisé');
      }
    }
  );

  it('le plafond exact est accepté', () => {
    expect(createLeaseSchema.safeParse({ ...base, rentAmount: 9_999_999_999.99 }).success).toBe(true);
  });

  it('le taux de pénalité est borné à la précision de la colonne, sans changer sa règle', () => {
    expect(createLeaseSchema.safeParse({ ...base, penaltyRate: 0.0001 }).success).toBe(true);
    expect(createLeaseSchema.safeParse({ ...base, penaltyRate: 100_000_000 }).success).toBe(false);
    expect(createLeaseSchema.safeParse({ ...base, penaltyRate: -1 }).success).toBe(false);
  });
});

describe('updateLeaseSchema : plafonds', () => {
  it.each(['rentAmount', 'serviceChargeAmount', 'securityDepositAmount'])('%s trop élevé est refusé', champ => {
    expect(updateLeaseSchema.safeParse({ [champ]: 99_999_999_999 }).success).toBe(false);
  });

  it('un loyer de 1500,5 reste accepté', () => {
    expect(updateLeaseSchema.safeParse({ rentAmount: 1500.5 }).success).toBe(true);
  });
});
