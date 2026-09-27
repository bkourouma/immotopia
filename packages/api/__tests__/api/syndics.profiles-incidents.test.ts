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
const INCIDENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const store = {
  ownerProfiles: new Map<string, any>(),
  tenantProfiles: new Map<string, any>(),
  incidents: new Map<string, any>(),
  imputations: new Map<string, any>(),
};

jest.mock('../../src/lib/syndics/queries', () => ({
  listSyndicatesByTenant: jest.fn(),
  getSyndicateWithLotsAndStats: jest.fn(),
  createSyndicateWithDefaults: jest.fn(),
  createSyndicateLot: jest.fn(),
  updateSyndicateLotByTenant: jest.fn(),
  updateSyndicateByTenant: jest.fn(),
  deleteEmptySyndicateByTenant: jest.fn(),
  listChargeCallsBySyndicate: jest.fn(),
  getChargeCallByTenant: jest.fn(),
  createChargeCallAndUpdateStatus: jest.fn(),
  recordChargePaymentWithStatusUpdate: jest.fn(),
  listChargeCallBatchesBySyndicate: jest.fn(),
  createChargeCallBatchBySyndicate: jest.fn(),
  listBudgetsBySyndicate: jest.fn(),
  createBudgetBySyndicate: jest.fn(),
  updateBudgetBySyndicate: jest.fn(),
  recomputeBudgetAllocationsByBudget: jest.fn(),
  generateChargeCallsFromBudget: jest.fn(),
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
  listLotOwnerProfilesBySyndicate: jest.fn(async () => Array.from(store.ownerProfiles.values())),
  createLotOwnerProfileBySyndicate: jest.fn(async (_tenantId: string, _syndicId: string, data: any) => {
    const created = { id: `owner-${store.ownerProfiles.size + 1}`, ...data };
    store.ownerProfiles.set(created.id, created);
    return created;
  }),
  updateLotOwnerProfileBySyndicate: jest.fn(async (_tenantId: string, _syndicId: string, profileId: string, data: any) => {
    const updated = { ...store.ownerProfiles.get(profileId), ...data };
    store.ownerProfiles.set(profileId, updated);
    return updated;
  }),
  listLotTenantProfilesBySyndicate: jest.fn(async () => Array.from(store.tenantProfiles.values())),
  createLotTenantProfileBySyndicate: jest.fn(async (_tenantId: string, _syndicId: string, data: any) => {
    const created = { id: `tenant-${store.tenantProfiles.size + 1}`, ...data };
    store.tenantProfiles.set(created.id, created);
    return created;
  }),
  updateLotTenantProfileBySyndicate: jest.fn(async (_tenantId: string, _syndicId: string, profileId: string, data: any) => {
    const updated = { ...store.tenantProfiles.get(profileId), ...data };
    store.tenantProfiles.set(profileId, updated);
    return updated;
  }),
  listIncidentsBySyndicate: jest.fn(async () => Array.from(store.incidents.values())),
  createIncidentBySyndicate: jest.fn(async (_tenantId: string, _syndicId: string, data: any) => {
    const created = { id: INCIDENT_ID, status: 'REPORTED', ...data, imputations: [] };
    store.incidents.set(created.id, created);
    return created;
  }),
  updateIncidentBySyndicate: jest.fn(async (_tenantId: string, _syndicId: string, incidentId: string, data: any) => {
    const updated = { ...store.incidents.get(incidentId), ...data };
    store.incidents.set(incidentId, updated);
    return updated;
  }),
  addIncidentImputationBySyndicate: jest.fn(async (_tenantId: string, _syndicId: string, incidentId: string, data: any) => {
    const created = { id: `imp-${store.imputations.size + 1}`, incidentId, ...data };
    store.imputations.set(created.id, created);
    return created;
  }),
}));

jest.mock('../../src/lib/syndics/notifications', () => ({
  notifyChargeCall: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false }),
  notifyMeetingConvocation: jest.fn().mockResolvedValue({ emailSent: 0, whatsappSent: 0 }),
  notifyChargeCallReminder: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false }),
}));

import syndicRoutes from '../../src/routes/syndic-routes';

describe('Syndics profiles/incidents routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', syndicRoutes);

  beforeEach(() => {
    jest.clearAllMocks();
    store.ownerProfiles.clear();
    store.tenantProfiles.clear();
    store.incidents.clear();
    store.imputations.clear();
  });

  it('creates and lists owner profiles', async () => {
    const createResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/profils/proprietaires`)
      .send({
        lotId: '22222222-2222-4222-8222-222222222222',
        contactId: '33333333-3333-4333-8333-333333333333',
        ownershipPercentage: 100,
        ownedSince: '2026-01-01T00:00:00.000Z',
      });

    expect(createResponse.status).toBe(201);
    const listResponse = await request(app)
      .get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/profils/proprietaires`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
  });

  it('creates and lists incidents then adds imputation', async () => {
    const incidentCreateResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/incidents`)
      .send({
        reportedByContactId: '33333333-3333-4333-8333-333333333333',
        lotId: '22222222-2222-4222-8222-222222222222',
        incidentType: 'LEAK',
        description: 'Fuite palier',
        urgency: 'HIGH',
      });
    expect(incidentCreateResponse.status).toBe(201);
    const incidentId = incidentCreateResponse.body.data.id as string;

    const listResponse = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/incidents`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);

    const imputationResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/incidents/${incidentId}/imputations`)
      .send({
        imputationType: 'SYNDICATE_BUDGET',
        amount: 20000,
      });
    expect(imputationResponse.status).toBe(201);
    expect(imputationResponse.body.data.amount).toBe(20000);
  });
});
