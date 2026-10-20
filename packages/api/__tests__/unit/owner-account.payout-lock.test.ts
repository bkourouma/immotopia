/**
 * Audit lot B : `createOwnerPayout` et `voidOwnerPayout` verrouillent la ligne
 * du compte de tiers (`SELECT … FOR UPDATE`) AVANT toute lecture du solde ou
 * toute écriture de mouvement.
 */
const calls: string[] = [];
const queryRaw = jest.fn(async (strings: TemplateStringsArray) => {
  calls.push('lock');
  const sql = strings.join(' ');
  expect(sql).toMatch(/FOR UPDATE/);
  expect(sql).toMatch(/third_party_accounts/);
  expect(sql).toMatch(/tenant_id/);
  return [{ id: 'acc-1' }];
});

const PAYOUT_ROW = {
  id: 'po-1',
  year: 2026,
  sequence: 1,
  amount: 1000,
  paidAt: new Date('2026-01-05T12:00:00Z'),
  method: 'CASH',
  createdByUserId: null,
  status: 'PAID',
  createdAt: new Date('2026-01-05T12:00:00Z')
};

const tx: any = {
  $queryRaw: (...a: any[]) => queryRaw(...(a as [TemplateStringsArray])),
  thirdPartyAccount: {
    findUnique: jest.fn(async () => {
      calls.push('read-balance');
      return { balance: -500000 };
    })
  },
  ownerPayout: {
    findFirst: jest.fn(async (args: any) => {
      if (args.select?.sequence) return null;
      calls.push('read-payout');
      return {
        id: 'po-1',
        accountId: 'acc-1',
        status: 'PAID',
        year: 2026,
        sequence: 1,
        amount: 1000,
        statementId: null,
        createdByUserId: null
      };
    }),
    create: jest.fn(async () => PAYOUT_ROW),
    update: jest.fn(async () => PAYOUT_ROW)
  },
  ownerStatement: { update: jest.fn(), updateMany: jest.fn() }
};

jest.mock('../../src/utils/database', () => ({
  prisma: { $transaction: (fn: any) => fn(tx), user: { findMany: jest.fn().mockResolvedValue([]) } }
}));
jest.mock('../../src/lib/finance/accounting', () => ({ postDocumentEntryTx: jest.fn() }));
jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: jest.fn(async () => {
    calls.push('movement');
  })
}));
jest.mock('../../src/lib/rental-fees/materialize', () => ({ materializeManagementFees: jest.fn() }));
jest.mock('../../src/lib/settings/finance-settings', () => ({
  getAgencyFinanceSettings: jest.fn().mockResolvedValue({})
}));
jest.mock('../../src/lib/treasury/accounts', () => ({
  assertTreasuryAccountUsableTx: jest.fn(),
  resolveTreasuryAccountTx: jest.fn().mockResolvedValue({ journal: 'CASH', chartOfAccountId: 'c1' })
}));
jest.mock('../../src/lib/owner-account/accounts', () => ({
  ensureRentalAccountsTx: jest.fn().mockResolvedValue({ ownerFunds: 'f1' }),
  journalResolver: jest.fn(() => jest.fn().mockResolvedValue('j1'))
}));
jest.mock('../../src/lib/owner-account/sync', () => ({
  getOrCreateOwnerAccountTx: jest.fn(async () => ({ id: 'acc-1' })),
  listAgencyOwners: jest.fn(),
  OWNER_SOURCE: { PAYOUT: 'OWNER_PAYOUT' },
  reverseDocumentEntryTx: jest.fn(),
  syncOwnerAccount: jest.fn()
}));

import { createOwnerPayout, voidOwnerPayout } from '../../src/lib/owner-account/service';

beforeEach(() => {
  calls.length = 0;
});

describe('verrou du compte propriétaire', () => {
  it('createOwnerPayout : verrou avant la lecture du solde', async () => {
    await createOwnerPayout('tenant-A', 'owner-1', { amount: 1000, paidAt: '2026-01-05', method: 'CASH' }, 'user-1');
    expect(calls.indexOf('lock')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('read-balance'));
    expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('movement'));
  });

  it('voidOwnerPayout : verrou avant la relecture du reversement et le mouvement', async () => {
    await voidOwnerPayout('tenant-A', 'owner-1', 'po-1', { reason: 'Erreur de saisie' }, 'user-1');
    const lock = calls.indexOf('lock');
    expect(lock).toBeGreaterThan(-1);
    expect(calls.indexOf('read-payout', lock)).toBeGreaterThan(lock);
    expect(lock).toBeLessThan(calls.indexOf('movement'));
  });
});
