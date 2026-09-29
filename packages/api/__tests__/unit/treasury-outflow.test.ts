/**
 * Compte payeur d'un décaissement de chantier (`lib/treasury/outflow.ts`),
 * BUG-2026-09-29-032 : règlement de salaire, de tâcheron, paiement de bail.
 * `accounts.ts` et `balance.ts` sont mockés : ils ont leurs propres tests, on
 * vérifie ici l'assemblage — le mode par défaut, le compte choisi, et que le
 * contrôle de solde porte sur le compte résolu et le bon montant.
 */

const resolveOutflowTreasuryAccountTx = jest.fn();
const assertTreasuryCanPayTx = jest.fn();

jest.mock('../../src/lib/treasury/accounts', () => ({
  resolveOutflowTreasuryAccountTx: (...args: any[]) => resolveOutflowTreasuryAccountTx(...args)
}));
jest.mock('../../src/lib/treasury/balance', () => ({
  assertTreasuryCanPayTx: (...args: any[]) => assertTreasuryCanPayTx(...args)
}));

import { outflowPayerSchema, resolveAndCheckOutflowTx } from '../../src/lib/treasury/outflow';

const CAISSE = {
  treasuryAccountId: 't-caisse',
  chartOfAccountId: 'c-caisse',
  label: 'Caisse principale',
  journal: 'CASH'
};

beforeEach(() => {
  jest.clearAllMocks();
  resolveOutflowTreasuryAccountTx.mockResolvedValue(CAISSE);
  assertTreasuryCanPayTx.mockResolvedValue(undefined);
});

describe('resolveAndCheckOutflowTx', () => {
  it('sans choix : espèces, compte par défaut, et le solde est contrôlé pour le montant demandé', async () => {
    const tx: any = {};
    const treasury = await resolveAndCheckOutflowTx(tx, 'agence-1', undefined, 3_000_000);

    expect(resolveOutflowTreasuryAccountTx).toHaveBeenCalledWith(tx, 'agence-1', {
      method: 'CASH',
      treasuryAccountId: null
    });
    expect(assertTreasuryCanPayTx).toHaveBeenCalledWith(tx, 'agence-1', CAISSE, 3_000_000);
    expect(treasury).toBe(CAISSE);
  });

  it('transmet le mode et le compte choisis', async () => {
    await resolveAndCheckOutflowTx(
      {} as any,
      'agence-1',
      { method: 'BANK_TRANSFER', treasuryAccountId: 'compte-x' },
      10
    );
    expect(resolveOutflowTreasuryAccountTx).toHaveBeenCalledWith(expect.anything(), 'agence-1', {
      method: 'BANK_TRANSFER',
      treasuryAccountId: 'compte-x'
    });
  });

  it('propage le refus « solde insuffisant » : rien n’est résolu au-delà', async () => {
    assertTreasuryCanPayTx.mockRejectedValueOnce(Object.assign(new Error('Solde insuffisant'), { status: 400 }));
    await expect(resolveAndCheckOutflowTx({} as any, 'agence-1', null, 5)).rejects.toMatchObject({ status: 400 });
  });
});

describe('outflowPayerSchema', () => {
  it('accepte un corps vide, un mode seul, ou un mode et un compte', () => {
    expect(outflowPayerSchema.parse({})).toEqual({});
    expect(outflowPayerSchema.parse({ method: 'CASH' })).toEqual({ method: 'CASH' });
    const id = '3f0c1c1e-8a55-4d0a-9d0e-0a1b2c3d4e5f';
    expect(outflowPayerSchema.parse({ method: 'MOBILE_MONEY', treasuryAccountId: id })).toEqual({
      method: 'MOBILE_MONEY',
      treasuryAccountId: id
    });
  });

  it('refuse un mode inconnu (« Autre » inclus) et un compte qui n’est pas un identifiant', () => {
    expect(outflowPayerSchema.safeParse({ method: 'OTHER' }).success).toBe(false);
    expect(outflowPayerSchema.safeParse({ treasuryAccountId: 'pas-un-uuid' }).success).toBe(false);
  });
});
