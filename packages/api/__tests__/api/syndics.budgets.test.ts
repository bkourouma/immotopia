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
const BUDGET_ID = '22222222-2222-4222-8222-222222222222';

const store = {
  budgets: new Map<string, any>(),
  batches: new Map<string, any>(),
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
  listChartOfAccountsBySyndicate: jest.fn(),
  createChartOfAccountBySyndicate: jest.fn(),
  listAccountingJournalsBySyndicate: jest.fn(),
  createAccountingJournalBySyndicate: jest.fn(),
  listJournalEntriesBySyndicate: jest.fn(),
  createJournalEntryBySyndicate: jest.fn(),
  lockJournalEntryBySyndicate: jest.fn(),
  getTrialBalanceBySyndicate: jest.fn(),
  getGeneralLedgerBySyndicate: jest.fn(),
  listBudgetsBySyndicate: jest.fn(async () => Array.from(store.budgets.values())),
  createBudgetBySyndicate: jest.fn(async (_tenantId: string, _syndicId: string, data: any) => {
    const created = { id: BUDGET_ID, status: 'DRAFT', ...data, allocations: [] };
    store.budgets.set(created.id, created);
    return created;
  }),
  updateBudgetBySyndicate: jest.fn(async (_tenantId: string, _syndicId: string, budgetId: string, data: any) => {
    const current = store.budgets.get(budgetId);
    const updated = { ...current, ...data };
    store.budgets.set(budgetId, updated);
    return updated;
  }),
  recomputeBudgetAllocationsByBudget: jest.fn(async () => [
    { id: 'alloc-1', lotId: 'lot-1', totalAllocated: 40000 },
    { id: 'alloc-2', lotId: 'lot-2', totalAllocated: 60000 },
  ]),
  listChargeCallBatchesBySyndicate: jest.fn(async () => Array.from(store.batches.values())),
  createChargeCallBatchBySyndicate: jest.fn(async (_tenantId: string, _syndicId: string, data: any) => {
    const created = { id: `batch-${store.batches.size + 1}`, ...data };
    store.batches.set(created.id, created);
    return created;
  }),
  generateChargeCallsFromBudget: jest.fn(async (_tenantId: string, _syndicId: string, budgetId: string, data: any) => {
    const created = { id: `batch-${store.batches.size + 1}`, budgetId, ...data, chargeCalls: [{ id: 'charge-1' }] };
    store.batches.set(created.id, created);
    return created;
  }),
}));

jest.mock('../../src/lib/syndics/notifications', () => ({
  notifyChargeCall: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false }),
  notifyMeetingConvocation: jest.fn().mockResolvedValue({ emailSent: 0, whatsappSent: 0 }),
  notifyChargeCallReminder: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false }),
}));

import syndicRoutes from '../../src/routes/syndic-routes';

describe('Syndics budgets routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', syndicRoutes);

  beforeEach(() => {
    jest.clearAllMocks();
    store.budgets.clear();
    store.batches.clear();
  });

  it('creates and lists budgets', async () => {
    const createResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/budgets`)
      .send({
        fiscalYear: 2026,
        label: 'Budget 2026',
        totalAmount: 1000000,
        currency: 'XOF',
        lines: [
          {
            category: 'Maintenance',
            description: 'Maintenance courante',
            amountForecast: 1000000,
            distributionKey: 'GENERAL_SHARES',
          },
        ],
      });

    expect(createResponse.status).toBe(201);
    const listResponse = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/budgets`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
  });

  it('recomputes allocations and generates calls from budget', async () => {
    await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/budgets`)
      .send({
        fiscalYear: 2026,
        label: 'Budget 2026',
        totalAmount: 1000000,
        lines: [
          {
            category: 'Maintenance',
            description: 'Maintenance courante',
            amountForecast: 1000000,
            distributionKey: 'GENERAL_SHARES',
          },
        ],
      });

    const approveResponse = await request(app)
      .patch(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/budgets/${BUDGET_ID}`)
      .send({ status: 'APPROVED' });
    expect(approveResponse.status).toBe(200);

    const recomputeResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/budgets/${BUDGET_ID}/repartition`)
      .send({});
    expect(recomputeResponse.status).toBe(200);

    const generateResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/budgets/${BUDGET_ID}/generer-appels`)
      .send({
        label: 'Appels T2',
        period: '2026-Q2',
        dueDate: '2026-04-30T00:00:00.000Z',
        batchType: 'REGULAR',
        currency: 'XOF',
      });
    expect(generateResponse.status).toBe(201);
    expect(generateResponse.body.data.chargeCalls).toHaveLength(1);
  });

  it('creates and lists charge call batches', async () => {
    const createResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/charges/batch`)
      .send({
        label: 'Batch exceptionnel',
        period: '2026-05',
        dueDate: '2026-05-31T00:00:00.000Z',
        batchType: 'EXCEPTIONAL',
        totalAmount: 150000,
        currency: 'XOF',
      });

    expect(createResponse.status).toBe(201);
    const listResponse = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/charges/batch`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
  });
});

