/**
 * Revue locative, H1 : `generateOwnerStatement` retire de l'encaissé la part de l'agence
 * (pénalités attribuées à l'agence, frais de rejet de prélèvement) et répartit l'indivision
 * pièce par pièce, comme le compte propriétaire.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const crmContactFindFirst = jest.fn();
const propertyFindMany = jest.fn();
const tenantClientFindMany = jest.fn();
const tenantClientFindFirst = jest.fn();
const shareFindMany = jest.fn();
const installmentFindMany = jest.fn();
const statementCreate = jest.fn();
const resolveScope = jest.fn();
const sharesByProperty = jest.fn();
const settings = jest.fn();

const emptyList: jest.Mock = jest.fn(async (..._a: any[]) => []);

jest.mock('../../src/utils/database', () => {
  const client: any = {
    crmContact: { findFirst: (...a: any[]) => crmContactFindFirst(...a) },
    property: { findMany: (...a: any[]) => propertyFindMany(...a) },
    tenantClient: {
      findMany: (...a: any[]) => tenantClientFindMany(...a),
      findFirst: (...a: any[]) => tenantClientFindFirst(...a)
    },
    propertyOwnershipShare: { findMany: (...a: any[]) => shareFindMany(...a) },
    ownerStatement: {
      findUnique: jest.fn(async () => null),
      create: (...a: any[]) => statementCreate(...a)
    },
    ownerStatementItem: { createMany: jest.fn(async () => ({ count: 0 })), deleteMany: jest.fn() },
    rentalLease: { findMany: jest.fn(async () => [{ id: 'lease-1' }]) },
    rentalInstallment: { findMany: (...a: any[]) => installmentFindMany(...a) },
    propertyExpense: { findMany: (...a: any[]) => emptyList(...a) },
    managementFee: { findMany: (...a: any[]) => emptyList(...a) },
    rentWithholding: { findMany: (...a: any[]) => emptyList(...a) },
    thirdPartyMovement: { findMany: (...a: any[]) => emptyList(...a) }
  };
  client.$transaction = async (fn: any) => fn(client);
  return { prisma: client };
});
jest.mock('../../src/lib/owner-portal-scope', () => ({
  activeMandateWhere: jest.fn(),
  resolveOwnerPortalPropertyIds: (...a: any[]) => resolveScope(...a)
}));
jest.mock('../../src/lib/rental-fees/materialize', () => ({ materializeManagementFees: jest.fn() }));
jest.mock('../../src/lib/ownership/service', () => ({
  ownerSharesByProperty: (...a: any[]) => sharesByProperty(...a)
}));
jest.mock('../../src/lib/settings/finance-settings', () => ({
  getAgencyFinanceSettings: (...a: any[]) => settings(...a)
}));
jest.mock('../../src/lib/finance/cost-allocation', () => ({ syncWorkProgramCostTx: jest.fn() }));
jest.mock('../../src/lib/treasury/accounts', () => ({
  assertTreasuryAccountUsableTx: jest.fn(),
  resolveTreasuryAccountTx: jest.fn()
}));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({ syncDirectExpenseEntryTx: jest.fn() }));
jest.mock('../../src/lib/patrimoine/property-asset', () => ({
  ensurePropertyAsset: jest.fn(),
  storedPropertyReliability: jest.fn()
}));

import { generateOwnerStatement } from '../../src/lib/patrimoine/queries';
import { OWNER_STATEMENT_COMPUTATION_VERSION } from '../../src/lib/patrimoine/owner-statement-computation';
import { splitAmount } from '../../src/lib/ownership/split';

const TENANT = 'tenant-1';
const PAID_AT = new Date(Date.UTC(2026, 8, 6));

function installment(allocations: number[]) {
  return {
    status: 'PAID',
    due_date: new Date(Date.UTC(2026, 8, 5)),
    amount_rent: 200_000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 10_000,
    items: [{ amount: 5_000, metadata: { kind: 'DIRECT_DEBIT_REJECT_FEE' } }],
    lease: { property_id: 'prop-A' },
    payments: allocations.map(amount => ({
      amount,
      payment: { succeeded_at: PAID_AT, initiated_at: PAID_AT }
    }))
  };
}

const lastStatementData = () => (statementCreate.mock.calls.at(-1)?.[0] as any).data;

describe('generateOwnerStatement : aligné sur le compte propriétaire', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    crmContactFindFirst.mockResolvedValue({ id: 'contact-A' });
    propertyFindMany.mockResolvedValue([{ id: 'prop-A' }]);
    tenantClientFindMany.mockResolvedValue([{ id: 'client-A', userId: 'user-A' }]);
    tenantClientFindFirst.mockResolvedValue({ id: 'client-A' });
    shareFindMany.mockResolvedValue([]);
    resolveScope.mockResolvedValue(['prop-A']);
    sharesByProperty.mockResolvedValue(new Map());
    statementCreate.mockResolvedValue({ id: 'st-1' });
    settings.mockResolvedValue({ penaltyBeneficiary: 'AGENCY', penaltyIncomeAccountNumber: '7071' });
  });

  const generate = () =>
    generateOwnerStatement(TENANT, { ownerContactId: 'contact-A', period: '2026-09', propertyIds: ['prop-A'] }).catch(
      () => undefined
    );

  it('(a) retire pénalités agence et frais de rejet : le net est ce que le compte inscrit', async () => {
    installmentFindMany.mockResolvedValue([installment([215_000])]);
    await generate();
    // Même arithmétique que sync.ts : 215 000 − 10 238 (pénalité) − 5 119 (frais de rejet).
    const data = lastStatementData();
    expect(Number(data.totalRevenue)).toBe(215_000 - 10_238 - 5_119);
    expect(Number(data.netAmount)).toBe(215_000 - 10_238 - 5_119);
    expect(data.computationVersion).toBe(OWNER_STATEMENT_COMPUTATION_VERSION);
    // L'appelé reste celui de l'échéance entière.
    expect(Number(data.totalRentDue)).toBe(210_000);
  });

  it('les pénalités restent au propriétaire quand elles ne reviennent pas à l’agence (frais de rejet toujours retirés)', async () => {
    settings.mockResolvedValue({ penaltyBeneficiary: 'OWNER', penaltyIncomeAccountNumber: null });
    installmentFindMany.mockResolvedValue([installment([215_000])]);
    await generate();
    expect(Number(lastStatementData().totalRevenue)).toBe(215_000 - 5_119);
  });

  it('(b) indivision : la part du propriétaire est celle de splitAmount sur chaque affectation', async () => {
    const shares = [
      { ownerClientId: 'client-A', sharePercent: 33.3333 },
      { ownerClientId: 'client-B', sharePercent: 33.3333 },
      { ownerClientId: 'client-C', sharePercent: 33.3334 }
    ];
    sharesByProperty.mockResolvedValue(new Map([['prop-A', 33.3333]]));
    shareFindMany.mockImplementation(async (args: any) =>
      // 1er appel (périmètre) : propertyId seul ; 2e appel (indivision) : lignes complètes.
      args?.select?.ownerClientId
        ? shares.map(share => ({ propertyId: 'prop-A', ...share }))
        : [{ propertyId: 'prop-A' }]
    );
    settings.mockResolvedValue({ penaltyBeneficiary: 'OWNER', penaltyIncomeAccountNumber: null });
    const inst = installment([100_001, 50_003]);
    inst.items = [];
    inst.penalty_amount = 0;
    installmentFindMany.mockResolvedValue([inst]);
    await generate();
    const expected =
      (splitAmount(100_001, shares).get('client-A') ?? 0) + (splitAmount(50_003, shares).get('client-A') ?? 0);
    expect(Number(lastStatementData().totalRevenue)).toBe(expected);
  });
});
