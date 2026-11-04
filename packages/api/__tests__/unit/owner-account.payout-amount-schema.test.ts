/**
 * BUG-2026-11-03-027 : un reversement de 1000,555 ou de plus de 9 999 999 999,99
 * est refusé en 400 (message lisible) ; deux décimales restent acceptées.
 * BUG-2026-11-03-013 (côté API) : retenue à la source allumée sans date = refus.
 * BUG-2026-11-03-026 (côté API) : forfait à 0 = refus.
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/lib/finance/accounting', () => ({ postDocumentEntryTx: jest.fn() }));
jest.mock('../../src/lib/finance/ledger', () => ({ appendThirdPartyMovementTx: jest.fn() }));
jest.mock('../../src/lib/rental-fees/materialize', () => ({ materializeManagementFees: jest.fn() }));
jest.mock('../../src/lib/treasury/accounts', () => ({
  assertTreasuryAccountUsableTx: jest.fn(),
  resolveTreasuryAccountTx: jest.fn()
}));
jest.mock('../../src/lib/owner-account/accounts', () => ({
  ensureRentalAccountsTx: jest.fn(),
  journalResolver: jest.fn()
}));
jest.mock('../../src/lib/owner-account/sync', () => ({
  getOrCreateOwnerAccountTx: jest.fn(),
  listAgencyOwners: jest.fn(),
  OWNER_SOURCE: { PAYOUT: 'OWNER_PAYOUT' },
  reverseDocumentEntryTx: jest.fn(),
  syncOwnerAccount: jest.fn()
}));

import { payoutSchema, voidSchema } from '../../src/lib/owner-account/service';
import { updateFinanceSettingsSchema } from '../../src/lib/settings/finance-settings';

const base = { paidAt: '2026-11-03', method: 'CASH' as const };
const messages = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  result.error?.issues.map(issue => issue.message) ?? [];

describe('payoutSchema.amount', () => {
  it.each([1000, 1000.5, 2500.75, 0.01, 9_999_999_999.99, '1000.5'])('accepte %s', amount => {
    expect(payoutSchema.safeParse({ ...base, amount }).success).toBe(true);
  });

  it('refuse plus de 2 décimales', () => {
    const result = payoutSchema.safeParse({ ...base, amount: 1000.555 });
    expect(result.success).toBe(false);
    expect(messages(result as any)).toEqual(['Le montant ne peut avoir plus de 2 décimales.']);
  });

  it('refuse un montant au-delà du maximum', () => {
    const result = payoutSchema.safeParse({ ...base, amount: 10_000_000_000 });
    expect(result.success).toBe(false);
    expect(messages(result as any)[0]).toContain('dépasse le maximum');
  });

  it.each([0, -5])('refuse %s', amount => {
    const result = payoutSchema.safeParse({ ...base, amount });
    expect(messages(result as any)).toEqual(['Le montant doit être supérieur à 0']);
  });
});

describe('voidSchema.reason', () => {
  it('distingue motif vide et motif trop court', () => {
    expect(messages(voidSchema.safeParse({ reason: '   ' }) as any)).toEqual(['Le motif est requis']);
    expect(messages(voidSchema.safeParse({ reason: 'ab' }) as any)).toEqual([
      'Le motif doit contenir au moins 3 caractères'
    ]);
    expect(voidSchema.safeParse({ reason: 'Erreur de saisie' }).success).toBe(true);
  });
});

describe('updateFinanceSettingsSchema', () => {
  const valid = {
    vatRegistered: false,
    vatRate: 0,
    managementFeeRate: null,
    managementFeeBase: 'RENT_ONLY'
  };

  it('refuse la retenue à la source sans date de début', () => {
    const result = updateFinanceSettingsSchema.safeParse({
      ...valid,
      withholdingEnabled: true,
      withholdingStartsOn: null
    });
    expect(result.success).toBe(false);
    expect(messages(result as any)[0]).toContain('à partir de quelle date');
  });

  it('accepte la retenue avec une date', () => {
    expect(
      updateFinanceSettingsSchema.safeParse({ ...valid, withholdingEnabled: true, withholdingStartsOn: '2026-11-03' })
        .success
    ).toBe(true);
  });

  it('refuse un forfait à 0', () => {
    const result = updateFinanceSettingsSchema.safeParse({
      ...valid,
      managementFeeMode: 'FIXED',
      managementFeeFixedAmount: 0
    });
    expect(result.success).toBe(false);
    expect(messages(result as any)).toEqual(['Le forfait doit être supérieur à 0']);
  });
});
