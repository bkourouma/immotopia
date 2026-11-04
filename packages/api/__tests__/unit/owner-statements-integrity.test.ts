/**
 * Intégrité des relevés de gérance (recette GL-10-017/018) :
 * - un relevé ne retient que des biens du périmètre de son propriétaire ;
 * - le PATCH ne fait pas sortir un relevé de « Payé ».
 */
const REACHED = 'COMPUTATION_REACHED';

const crmContactFindFirst = jest.fn();
const propertyFindMany = jest.fn();
const tenantClientFindMany = jest.fn();
const tenantClientFindFirst = jest.fn();
const shareFindMany = jest.fn();
const statementFindUnique = jest.fn();
const statementFindFirst = jest.fn();
const statementUpdate = jest.fn();
const resolveScope = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    crmContact: { findFirst: (...a: any[]) => crmContactFindFirst(...a) },
    property: { findMany: (...a: any[]) => propertyFindMany(...a) },
    tenantClient: {
      findMany: (...a: any[]) => tenantClientFindMany(...a),
      findFirst: (...a: any[]) => tenantClientFindFirst(...a)
    },
    propertyOwnershipShare: { findMany: (...a: any[]) => shareFindMany(...a) },
    ownerStatement: {
      findUnique: (...a: any[]) => statementFindUnique(...a),
      findFirst: (...a: any[]) => statementFindFirst(...a),
      update: (...a: any[]) => statementUpdate(...a)
    },
    rentalLease: {
      findMany: jest.fn(async () => {
        throw new Error(REACHED);
      })
    }
  }
}));
jest.mock('../../src/lib/owner-portal-scope', () => ({
  activeMandateWhere: jest.fn(),
  resolveOwnerPortalPropertyIds: (...a: any[]) => resolveScope(...a)
}));
jest.mock('../../src/lib/rental-fees/materialize', () => ({ materializeManagementFees: jest.fn() }));
jest.mock('../../src/lib/ownership/service', () => ({ ownerSharesByProperty: jest.fn(async () => new Map()) }));
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

import { generateOwnerStatement, updateOwnerStatement } from '../../src/lib/patrimoine/queries';

const TENANT = 'tenant-1';

describe('generateOwnerStatement : périmètre du propriétaire', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    crmContactFindFirst.mockResolvedValue({ id: 'contact-A' });
    propertyFindMany.mockResolvedValue([{ id: 'prop-A' }]);
    tenantClientFindMany.mockResolvedValue([{ id: 'client-A', userId: 'user-A' }]);
    tenantClientFindFirst.mockResolvedValue({ id: 'client-A' });
    shareFindMany.mockResolvedValue([]);
    resolveScope.mockResolvedValue(['prop-A']);
    statementFindUnique.mockResolvedValue(null);
  });

  it("refuse un bien d'un autre propriétaire (NotFound)", async () => {
    propertyFindMany.mockResolvedValue([{ id: 'prop-B' }]);
    await expect(
      generateOwnerStatement(TENANT, { ownerContactId: 'contact-A', period: '2026-09', propertyIds: ['prop-B'] })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuse un mélange de biens du propriétaire et d'un autre", async () => {
    propertyFindMany.mockResolvedValue([{ id: 'prop-A' }, { id: 'prop-B' }]);
    await expect(
      generateOwnerStatement(TENANT, {
        ownerContactId: 'contact-A',
        period: '2026-09',
        propertyIds: ['prop-A', 'prop-B']
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuse avec un message explicite (400) quand le contact n'a aucun compte propriétaire", async () => {
    tenantClientFindMany.mockResolvedValue([]);
    await expect(
      generateOwnerStatement(TENANT, { ownerContactId: 'contact-A', period: '2026-09', propertyIds: ['prop-A'] })
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('aucun compte propriétaire') });
  });

  it('accepte un bien du périmètre (le calcul démarre)', async () => {
    await expect(
      generateOwnerStatement(TENANT, { ownerContactId: 'contact-A', period: '2026-09', propertyIds: ['prop-A'] })
    ).rejects.toThrow(REACHED);
  });

  it('accepte un bien en indivision dont le propriétaire détient une quote-part', async () => {
    propertyFindMany.mockResolvedValue([{ id: 'prop-S' }]);
    resolveScope.mockResolvedValue([]);
    shareFindMany.mockResolvedValue([{ propertyId: 'prop-S' }]);
    await expect(
      generateOwnerStatement(TENANT, { ownerContactId: 'contact-A', period: '2026-09', propertyIds: ['prop-S'] })
    ).rejects.toThrow(REACHED);
  });
});

describe('updateOwnerStatement : sortie de PAID', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    statementUpdate.mockResolvedValue({ id: 's1' });
  });

  it.each(['DRAFT', 'SENT'] as const)('refuse PAID -> %s', async status => {
    statementFindFirst.mockResolvedValue({ id: 's1', tenantId: TENANT, status: 'PAID' });
    await expect(updateOwnerStatement(TENANT, 's1', { status })).rejects.toMatchObject({ status: 409 });
    expect(statementUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['DRAFT', 'SENT'],
    ['SENT', 'DRAFT']
  ] as const)('conserve la transition %s -> %s', async (from, to) => {
    statementFindFirst.mockResolvedValue({ id: 's1', tenantId: TENANT, status: from });
    await updateOwnerStatement(TENANT, 's1', { status: to });
    expect(statementUpdate).toHaveBeenCalled();
  });

  it.each(['DRAFT', 'SENT', 'PAID'])('refuse de poser « Payé » à la main (depuis %s) : 400', async from => {
    statementFindFirst.mockResolvedValue({ id: 's1', tenantId: TENANT, status: from });
    await expect(updateOwnerStatement(TENANT, 's1', { status: 'PAID' })).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('reversement')
    });
    expect(statementUpdate).not.toHaveBeenCalled();
  });
});
