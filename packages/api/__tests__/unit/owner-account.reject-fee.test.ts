/**
 * Compte propriétaire : les frais de rejet de prélèvement refacturés au locataire (spec 042, P3) rémunèrent
 * l'agence, jamais le propriétaire (`lib/owner-account/sync.ts`, `rejectFeePart`).
 *
 * `syncOwnerAccount` est exécuté pour de vrai ; la base est un magasin minimal, la comptabilité et le grand
 * livre sont simulés : on vérifie ce qui est crédité au propriétaire et ce qui est écrit au compte de produit.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const mockState: { allocations: Row[]; settings: Row; accounts: Row } = {
  allocations: [],
  settings: {},
  accounts: {}
};
const mockPostEntry = jest.fn();
const mockAppendMovement = jest.fn();

/** Client de transaction : chaque méthode répond « rien » (listes vides, pas de ligne), sauf le compte de tiers. */
const mockTx: Row = new Proxy(
  {},
  {
    get: (_target, model: string) =>
      new Proxy(
        {},
        {
          get: (_models, method: string) =>
            jest.fn(async () => {
              if (model === 'thirdPartyAccount' && method === 'findUnique') return { id: 'acct-owner', balance: 0 };
              if (method === 'findMany') return [];
              if (method === 'count') return 0;
              if (method === 'create') return { id: 'created' };
              if (method === 'findFirst' || method === 'findUnique') return null;
              return { count: 0 };
            })
        }
      )
  }
);

const mockPrisma: Row = {
  tenantClient: {
    findFirst: jest.fn(async () => ({ id: 'owner-1', userId: 'user-owner', ownerTaxStatus: null, user: {} }))
  },
  propertyOwnershipShare: { findMany: jest.fn(async () => []) },
  rentalLease: { findMany: jest.fn(async () => [{ id: 'lease-1', property_id: 'prop-1' }]) },
  property: { findMany: jest.fn(async () => []) },
  rentalPaymentAllocation: { findMany: jest.fn(async () => mockState.allocations) },
  managementFee: { findMany: jest.fn(async () => []) },
  propertyExpense: { findMany: jest.fn(async () => []) },
  rentalPayment: { findMany: jest.fn(async () => []) },
  rentalDepositMovement: { findMany: jest.fn(async () => []) },
  rentWithholding: { findMany: jest.fn(async () => []) },
  $transaction: jest.fn(async (callback: (tx: Row) => Promise<unknown>) => callback(mockTx))
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/lib/finance/accounting', () => ({
  postDocumentEntryTx: (...args: unknown[]) => mockPostEntry(...args),
  ensureOperationalJournalTx: jest.fn(async () => 'journal-1')
}));
jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: (...args: unknown[]) => mockAppendMovement(...args)
}));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({
  directPropertyIdsTx: jest.fn(async () => new Set<string>())
}));
jest.mock('../../src/lib/rental-fees/materialize', () => ({ materializeManagementFees: jest.fn() }));
jest.mock('../../src/lib/settings/finance-settings', () => ({
  getAgencyFinanceSettings: jest.fn(async () => mockState.settings)
}));
jest.mock('../../src/lib/treasury/accounts', () => ({
  resolveTreasuryAccountTx: jest.fn(async () => ({ chartOfAccountId: 'acc-treasury', journal: 'BANK' }))
}));
jest.mock('../../src/lib/owner-account/accounts', () => ({
  ensureRentalAccountsTx: jest.fn(async () => mockState.accounts),
  journalResolver: () => async () => 'journal-1'
}));

import { syncOwnerAccount } from '../../src/lib/owner-account/sync';

const TENANT = 'tenant-a';
const FEE_KIND = 'DIRECT_DEBIT_REJECT_FEE';
const feeItem = (amount: number, kind: string = FEE_KIND) => ({ amount, metadata: { kind, lineId: 'line-1' } });

function allocation(over: { amount: number; rent?: number; otherFees?: number; penalty?: number; items?: Row[] }) {
  return {
    id: 'alloc-1',
    amount: over.amount,
    payment: {
      id: 'pay-1',
      succeeded_at: new Date('2026-10-27T00:00:00Z'),
      initiated_at: new Date('2026-10-26T00:00:00Z'),
      method: 'DIRECT_DEBIT',
      mm_operator: null,
      treasury_account_id: 'treasury-1'
    },
    installment: {
      period_year: 2026,
      period_month: 10,
      amount_rent: over.rent ?? 100000,
      amount_service: 0,
      amount_other_fees: over.otherFees ?? 0,
      penalty_amount: over.penalty ?? 0,
      items: over.items ?? [],
      lease: { id: 'lease-1', lease_number: 'B-001', property_id: 'prop-1' }
    }
  };
}

const rentMovement = () =>
  mockAppendMovement.mock.calls.map(call => call[1]).find(move => move.type === 'RENT_COLLECTED');
const rentEntry = () =>
  mockPostEntry.mock.calls.map(call => call[1]).find(entry => entry.documentType === 'OWNER_RENT_COLLECTED');
const linesOf = () => (rentEntry()?.lines ?? []) as Row[];
const agencyLine = () => linesOf().find(line => /Frais de rejet/.test(line.label));
const ownerLine = () => linesOf().find(line => line.thirdPartyAccountId);

beforeEach(() => {
  jest.clearAllMocks();
  mockState.allocations = [];
  mockState.settings = { penaltyBeneficiary: 'OWNER', penaltyIncomeAccountNumber: null, withholdingEnabled: false };
  mockState.accounts = { ownerFunds: 'acc-owner-funds', fees: 'acc-fees', vat: 'acc-vat', penaltyIncome: null };
  mockAppendMovement.mockResolvedValue({});
  mockPostEntry.mockResolvedValue({ entryId: 'entry-1' });
});

describe('compte propriétaire / frais de rejet de prélèvement', () => {
  it('paiement entier : le propriétaire ne reçoit que le loyer, l’agence les frais', async () => {
    mockState.allocations = [allocation({ amount: 105000, otherFees: 5000, items: [feeItem(5000)] })];
    await syncOwnerAccount(TENANT, 'owner-1', { skipFees: true });

    expect(rentMovement()).toMatchObject({ settled: 100000, billed: 0, sourceId: 'alloc-1' });
    expect(ownerLine()).toMatchObject({ accountId: 'acc-owner-funds', credit: 100000 });
    expect(agencyLine()).toMatchObject({ credit: 5000 });
    // La pièce reste équilibrée : trésorerie au débit pour le total encaissé.
    expect(linesOf().find(line => line.accountId === 'acc-treasury')).toMatchObject({ debit: 105000 });
    const credits = linesOf().reduce((sum, line) => sum + (line.credit ?? 0), 0);
    const debits = linesOf().reduce((sum, line) => sum + (line.debit ?? 0), 0);
    expect(credits).toBe(debits);
  });

  it('paiement partiel : les frais sont retirés au prorata du montant affecté', async () => {
    // Échéance de 105 000 dont 5 000 de frais ; la moitié seulement est affectée.
    mockState.allocations = [allocation({ amount: 52500, otherFees: 5000, items: [feeItem(5000)] })];
    await syncOwnerAccount(TENANT, 'owner-1', { skipFees: true });

    expect(agencyLine()).toMatchObject({ credit: 2500 });
    expect(rentMovement()).toMatchObject({ settled: 50000 });
    expect(ownerLine()).toMatchObject({ credit: 50000 });
  });

  it('frais nuls ou d’une autre nature : rien n’est retiré au propriétaire', async () => {
    mockState.allocations = [
      allocation({
        amount: 105000,
        otherFees: 5000,
        items: [feeItem(0), feeItem(5000, 'AUTRE_FRAIS'), { amount: 5000, metadata: null }]
      })
    ];
    await syncOwnerAccount(TENANT, 'owner-1', { skipFees: true });

    expect(rentMovement()).toMatchObject({ settled: 105000 });
    expect(ownerLine()).toMatchObject({ credit: 105000 });
    expect(agencyLine()).toBeUndefined();
  });

  it('échéance sans aucun article : comportement inchangé', async () => {
    mockState.allocations = [allocation({ amount: 100000 })];
    await syncOwnerAccount(TENANT, 'owner-1', { skipFees: true });
    expect(rentMovement()).toMatchObject({ settled: 100000 });
    expect(agencyLine()).toBeUndefined();
  });

  it('produit des frais : le compte des pénalités s’il existe, sinon celui des honoraires', async () => {
    mockState.allocations = [allocation({ amount: 105000, otherFees: 5000, items: [feeItem(5000)] })];

    await syncOwnerAccount(TENANT, 'owner-1', { skipFees: true });
    expect(agencyLine()).toMatchObject({ accountId: 'acc-fees', credit: 5000 });

    jest.clearAllMocks();
    mockState.accounts = { ...mockState.accounts, penaltyIncome: 'acc-penalties' };
    mockAppendMovement.mockResolvedValue({});
    mockPostEntry.mockResolvedValue({ entryId: 'entry-1' });
    await syncOwnerAccount(TENANT, 'owner-1', { skipFees: true });
    expect(agencyLine()).toMatchObject({ accountId: 'acc-penalties', credit: 5000 });
  });

  it('frais et pénalités revenant à l’agence : chacun retiré à son tour, sans double compte', async () => {
    mockState.settings = {
      penaltyBeneficiary: 'AGENCY',
      penaltyIncomeAccountNumber: '7061',
      withholdingEnabled: false
    };
    mockState.accounts = { ...mockState.accounts, penaltyIncome: 'acc-penalties' };
    // Loyer 100 000 + frais 5 000 + pénalité 5 000 = 110 000, réglé en entier.
    mockState.allocations = [allocation({ amount: 110000, otherFees: 5000, penalty: 5000, items: [feeItem(5000)] })];
    await syncOwnerAccount(TENANT, 'owner-1', { skipFees: true });

    expect(rentMovement()).toMatchObject({ settled: 100000 });
    expect(agencyLine()).toMatchObject({ credit: 5000 });
    expect(linesOf().find(line => /Pénalités/.test(line.label))).toMatchObject({ credit: 5000 });
  });
});
