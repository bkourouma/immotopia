/**
 * Comptes comptables de la gestion locative — lot 3.
 *
 * Deux règles qu'une erreur de paramétrage ou de mode de paiement suffirait à
 * casser en silence : un même numéro ne peut pas porter deux rôles, et
 * l'argent en espèces passe par la caisse, le reste par la banque.
 */

jest.mock('../../src/utils/database', () => ({ prisma: {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  ensureRentalAccountsTx,
  treasuryFor,
  PROVISIONAL_OWNER_FUNDS_ACCOUNT
} = require('../../src/lib/owner-account/accounts');

const settings = (overrides: Record<string, unknown> = {}) => ({
  vatRegistered: true,
  vatRate: 18,
  taxpayerNumber: null,
  managementFeeRate: 10,
  managementFeeBase: 'RENT_ONLY',
  managementFeeMode: 'PERCENT',
  managementFeeFixedAmount: null,
  ownerFundsAccountNumber: null,
  managementFeeAccountNumber: '706',
  vatCollectedAccountNumber: '4432',
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
  it('pose le compte des fonds des propriétaires au 4712, provisoirement, tant qu’il n’est pas paramétré', async () => {
    const tx = fakeTx(['571']);
    const accounts = await ensureRentalAccountsTx(tx, 'tenant-1', settings());

    expect(PROVISIONAL_OWNER_FUNDS_ACCOUNT).toBe('4712');
    expect(accounts.ownerFunds).toBe('new-4712');
    // La caisse existait déjà : elle est reprise, pas recréée.
    expect(accounts.cash).toBe('id-571');
    expect(tx.created.map(c => c.accountNumber).sort()).toEqual(['4432', '4712', '521', '706']);
    expect(tx.created.find(c => c.accountNumber === '706')).toMatchObject({ accountType: 'INCOME', accountClass: 7 });
  });

  it('suit le numéro choisi par l’agence', async () => {
    const accounts = await ensureRentalAccountsTx(fakeTx(), 'tenant-1', settings({ ownerFundsAccountNumber: '4671' }));
    expect(accounts.ownerFunds).toBe('new-4671');
  });

  it('refuse deux rôles sur un même compte', async () => {
    await expect(
      ensureRentalAccountsTx(fakeTx(), 'tenant-1', settings({ ownerFundsAccountNumber: '706' }))
    ).rejects.toThrow('Deux comptes de la gestion locative portent le même numéro');
  });
});

describe('treasuryFor', () => {
  const accounts = { ownerFunds: 'o', fees: 'f', vat: 'v', cash: 'caisse', bank: 'banque' };

  it('fait passer les espèces par la caisse', () => {
    expect(treasuryFor('CASH', accounts)).toEqual({ accountId: 'caisse', journal: 'CASH' });
  });

  it.each(['BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY', 'CARD', 'OTHER'])('fait passer %s par la banque', method => {
    expect(treasuryFor(method, accounts)).toEqual({ accountId: 'banque', journal: 'BANK' });
  });
});
