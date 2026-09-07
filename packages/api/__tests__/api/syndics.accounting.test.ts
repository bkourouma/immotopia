import express from 'express';
import request from 'supertest';

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforcePropertyTenantIsolation: (_req: any, _res: any, next: any) => next()
}));

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requireAnyPropertyPermission: () => (_req: any, _res: any, next: any) => next(),
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

const TENANT_ID = 'tenant-1';
const SYNDIC_ID = '11111111-1111-4111-8111-111111111111';
const JOURNAL_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_1_ID = '33333333-3333-4333-8333-333333333333';
const ACCOUNT_2_ID = '44444444-4444-4444-8444-444444444444';

const store = {
  accounts: new Map<string, any>(),
  journals: new Map<string, any>(),
  entries: new Map<string, any>(),
};

jest.mock('../../src/lib/syndics/queries', () => ({
  listSyndicatesByTenant: jest.fn(),
  getSyndicateWithLotsAndStats: jest.fn(),
  createSyndicateWithDefaults: jest.fn(),
  createSyndicateLot: jest.fn(),
  updateSyndicateLotByTenant: jest.fn(),
  updateSyndicateByTenant: jest.fn(),
  archiveSyndicateByTenant: jest.fn(),
  listChargeCallsBySyndicate: jest.fn(),
  getChargeCallByTenant: jest.fn(),
  createChargeCallAndUpdateStatus: jest.fn(),
  recordChargePaymentWithStatusUpdate: jest.fn(),
  listMeetingsBySyndicate: jest.fn(),
  getMeetingByTenant: jest.fn(),
  createMeetingWithResolutions: jest.fn(),
  updateMeetingByTenant: jest.fn(),
  addResolutionToMeeting: jest.fn(),
  castVoteAndRecomputeResolutionCounters: jest.fn(),
  addAgendaItemToMeeting: jest.fn(),
  updateAgendaItemByTenant: jest.fn(),
  deleteAgendaItemByTenant: jest.fn(),
  listServiceProvidersBySyndicate: jest.fn(),
  listMaintenanceContractsBySyndicate: jest.fn(),
  createMaintenanceContract: jest.fn(),
  getMaintenanceContractByTenant: jest.fn(),
  updateMaintenanceContractByTenant: jest.fn(),
  deleteMaintenanceContractByTenant: jest.fn(),
  listDocumentsBySyndicate: jest.fn(),
  createDocumentForSyndicate: jest.fn(),
  getFinanceSummaryBySyndicate: jest.fn(),
  listCommonAssetsBySyndicate: jest.fn(),
  listOverdueDashboardBySyndicate: jest.fn(),
  listPaymentRemindersBySyndicate: jest.fn(),
  createManualReminderForChargeCall: jest.fn(),
  runReminderBatchForSyndicate: jest.fn(),
  listLatePaymentPenaltiesBySyndicate: jest.fn(),
  createLatePaymentPenaltyForChargeCall: jest.fn(),
  waiveLatePaymentPenaltyByTenant: jest.fn(),
  createPaymentScheduleForChargeCall: jest.fn(),
  getOwnerAccountByLot: jest.fn(),
  listOwnerAccountTransactionsByLot: jest.fn(),
  createOwnerAccountAdjustmentByLot: jest.fn(),
  getOwnerAccountStatementByLot: jest.fn(),
  listChartOfAccountsBySyndicate: jest.fn(async () => Array.from(store.accounts.values())),
  createChartOfAccountBySyndicate: jest.fn(async (_tenantId: string, _syndicId: string, data: any) => {
    const created = { id: `acc-${store.accounts.size + 1}`, ...data };
    store.accounts.set(created.id, created);
    return created;
  }),
  listAccountingJournalsBySyndicate: jest.fn(async () => Array.from(store.journals.values())),
  createAccountingJournalBySyndicate: jest.fn(async (_tenantId: string, _syndicId: string, data: any) => {
    const created = { id: JOURNAL_ID, ...data };
    store.journals.set(created.id, created);
    return created;
  }),
  listJournalEntriesBySyndicate: jest.fn(async () => Array.from(store.entries.values())),
  createJournalEntryBySyndicate: jest.fn(async (_tenantId: string, _syndicId: string, data: any) => {
    const created = { id: `entry-${store.entries.size + 1}`, ...data, isLocked: false };
    store.entries.set(created.id, created);
    return created;
  }),
  lockJournalEntryBySyndicate: jest.fn(async (_tenantId: string, _syndicId: string, entryId: string) => {
    const found = store.entries.get(entryId);
    if (!found) {
      const err: any = new Error('Ecriture comptable introuvable');
      err.status = 404;
      throw err;
    }
    found.isLocked = true;
    return found;
  }),
  getTrialBalanceBySyndicate: jest.fn(async () => ({
    items: [{ accountNumber: '401', accountName: 'Fournisseurs', totalDebit: 10000, totalCredit: 10000, balance: 0 }],
    totals: { totalDebit: 10000, totalCredit: 10000, isBalanced: true },
  })),
  getGeneralLedgerBySyndicate: jest.fn(async () => [
    { id: 'line-1', account: { accountNumber: '401' }, entry: { reference: 'JE-1', journal: { code: 'JG' } }, debit: 10000, credit: 0 },
  ]),
}));

jest.mock('../../src/lib/syndics/notifications', () => ({
  notifyChargeCall: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false }),
  notifyMeetingConvocation: jest.fn().mockResolvedValue({ emailSent: 0, whatsappSent: 0 }),
  notifyChargeCallReminder: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false }),
}));

import syndicRoutes from '../../src/routes/syndic-routes';

describe('Syndics accounting routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', syndicRoutes);

  beforeEach(() => {
    jest.clearAllMocks();
    store.accounts.clear();
    store.journals.clear();
    store.entries.clear();
  });

  it('creates and lists chart accounts', async () => {
    const createResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/comptes`)
      .send({
        accountNumber: '401',
        accountName: 'Fournisseurs',
        accountClass: 4,
        accountType: 'LIABILITY',
      });

    expect(createResponse.status).toBe(201);
    const listResponse = await request(app)
      .get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/comptes`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
  });

  it('creates and lists accounting journals', async () => {
    const createResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/journaux`)
      .send({
        journalType: 'GENERAL',
        label: 'Journal general',
        code: 'JG',
        fiscalYear: 2026,
      });

    expect(createResponse.status).toBe(201);
    const listResponse = await request(app)
      .get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/journaux`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
  });

  it('creates, lists and locks accounting entries', async () => {
    const createResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/ecritures`)
      .send({
        journalId: JOURNAL_ID,
        entryDate: '2026-03-01T00:00:00.000Z',
        reference: 'JE-001',
        description: 'Ecriture manuelle',
        sourceType: 'MANUAL',
        lines: [
          { accountId: ACCOUNT_1_ID, debit: 10000, credit: 0, label: 'Debit' },
          { accountId: ACCOUNT_2_ID, debit: 0, credit: 10000, label: 'Credit' },
        ],
      });

    expect(createResponse.status).toBe(201);
    const entryId = createResponse.body.data.id as string;

    const listResponse = await request(app)
      .get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/ecritures`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);

    const lockResponse = await request(app)
      .patch(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/ecritures/${entryId}/verrouiller`)
      .send({ lock: true });
    expect(lockResponse.status).toBe(200);
    expect(lockResponse.body.data.isLocked).toBe(true);
  });

  it('returns balance and general ledger', async () => {
    const balanceResponse = await request(app)
      .get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/balance`);
    expect(balanceResponse.status).toBe(200);
    expect(balanceResponse.body.data.totals.isBalanced).toBe(true);

    const ledgerResponse = await request(app)
      .get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/grand-livre`);
    expect(ledgerResponse.status).toBe(200);
    expect(ledgerResponse.body.data).toHaveLength(1);
  });
});
