/**
 * Comptes comptables de la gestion locative — lots 3 et 10.
 *
 * Deux règles qu'une erreur de paramétrage suffirait à casser en silence : les
 * numéros par défaut sont ceux de la consolidation SYSCOHADA (4731 mandants,
 * 70611 honoraires), et un même numéro ne peut pas porter deux rôles. La
 * trésorerie se résout ailleurs (`lib/treasury/accounts.ts`).
 */

jest.mock('../../src/utils/database', () => ({ prisma: {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ensureRentalAccountsTx, OWNER_FUNDS_ACCOUNT } = require('../../src/lib/owner-account/accounts');

const settings = (overrides: Record<string, unknown> = {}) => ({
  vatRegistered: true,
  vatRate: 18,
  taxpayerNumber: null,
  managementFeeRate: 10,
  managementFeeBase: 'RENT_ONLY',
  managementFeeMode: 'PERCENT',
  managementFeeFixedAmount: null,
  ownerFundsAccountNumber: null,
  managementFeeAccountNumber: null,
  vatCollectedAccountNumber: null,
  cashShortageAccountNumber: null,
  cashSurplusAccountNumber: null,
  penaltyBeneficiary: 'OWNER',
  penaltyIncomeAccountNumber: null,
  withholdingEnabled: false,
  withholdingStartsOn: null,
  withholdingRateIndividual: 12,
  withholdingRateCompany: 15,
  withholdingAccountNumber: null,
  isDefault: false,
  updatedAt: null,
  ...overrides
});

function fakeTx(existingNumbers: string[] = []) {
  const created: Array<{ accountNumber: string; accountType: string; accountClass: number }> = [];
  return {
    created,
    chartOfAccount: {
      findMany: jest.fn(async () => existingNumbers.map(n => ({ id: `id-${n}`, accountNumber: n }))),
      create: jest.fn(async ({ data }: any) => {
        created.push({
          accountNumber: data.accountNumber,
          accountType: data.accountType,
          accountClass: data.accountClass
        });
        return { id: `new-${data.accountNumber}` };
      })
    }
  };
}

describe('ensureRentalAccountsTx', () => {
  it('pose les numéros de la consolidation SYSCOHADA tant que l’agence n’en a pas choisi', async () => {
    const tx = fakeTx(['401']);
    const accounts = await ensureRentalAccountsTx(tx, 'tenant-1', settings());

    expect(OWNER_FUNDS_ACCOUNT).toBe('4731');
    expect(accounts.ownerFunds).toBe('new-4731');
    // Le 401 existait déjà : il est repris, pas recréé.
    expect(accounts.suppliers).toBe('id-401');
    expect(accounts.penaltyIncome).toBeNull();
    expect(tx.created.map(c => c.accountNumber).sort()).toEqual(['4432', '4478', '4731', '70611']);
    expect(tx.created.find(c => c.accountNumber === '70611')).toMatchObject({ accountType: 'INCOME', accountClass: 7 });
    expect(tx.created.find(c => c.accountNumber === '4731')).toMatchObject({
      accountType: 'LIABILITY',
      accountClass: 4
    });
  });

  it('suit le numéro choisi par l’agence', async () => {
    const accounts = await ensureRentalAccountsTx(fakeTx(), 'tenant-1', settings({ ownerFundsAccountNumber: '4671' }));
    expect(accounts.ownerFunds).toBe('new-4671');
  });

  it('ouvre le compte de produit des pénalités seulement quand elles reviennent à l’agence', async () => {
    const accounts = await ensureRentalAccountsTx(
      fakeTx(),
      'tenant-1',
      settings({ penaltyBeneficiary: 'AGENCY', penaltyIncomeAccountNumber: '7078' })
    );
    expect(accounts.penaltyIncome).toBe('new-7078');
  });

  it('refuse deux rôles sur un même compte', async () => {
    await expect(
      ensureRentalAccountsTx(fakeTx(), 'tenant-1', settings({ ownerFundsAccountNumber: '70611' }))
    ).rejects.toThrow('Deux comptes de la gestion locative portent le même numéro');
  });
});
