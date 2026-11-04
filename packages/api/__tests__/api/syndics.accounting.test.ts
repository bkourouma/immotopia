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
  entries: new Map<string, any>()
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
  })
}));

// Les lectures (comptes, journal, grand livre, balance) passent par
// `accounting-reads` : on garde ses schemas Zod reels (donc les 400) et on
// remplace seulement les fonctions qui touchent la base.
jest.mock('../../src/lib/syndics/accounting-reads', () => ({
  ...jest.requireActual('../../src/lib/syndics/accounting-reads'),
  searchChartOfAccounts: jest.fn(),
  listAccountingEntriesPage: jest.fn(),
  getAccountLedger: jest.fn(),
  getTrialBalanceAggregated: jest.fn()
}));

jest.mock('../../src/lib/syndics/notifications', () => ({
  notifyChargeCall: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false }),
  notifyMeetingConvocation: jest.fn().mockResolvedValue({ emailSent: 0, whatsappSent: 0 }),
  notifyChargeCallReminder: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false })
}));

import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
import {
  getAccountLedger,
  getTrialBalanceAggregated,
  listAccountingEntriesPage,
  searchChartOfAccounts
} from '../../src/lib/syndics/accounting-reads';

const mockSearchChartOfAccounts = searchChartOfAccounts as jest.Mock;
const mockListEntriesPage = listAccountingEntriesPage as jest.Mock;
const mockGetAccountLedger = getAccountLedger as jest.Mock;
const mockGetTrialBalance = getTrialBalanceAggregated as jest.Mock;

describe('Syndics accounting routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', syndicRoutes);
  app.use(errorHandler);

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchChartOfAccounts.mockImplementation(async () => Array.from(store.accounts.values()));
    mockListEntriesPage.mockImplementation(async () => {
      const items = Array.from(store.entries.values());
      return { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } };
    });
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
        accountType: 'LIABILITY'
      });

    expect(createResponse.status).toBe(201);
    const listResponse = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/comptes`);
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
        fiscalYear: 2026
      });

    expect(createResponse.status).toBe(201);
    const listResponse = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/journaux`);
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
          { accountId: ACCOUNT_2_ID, debit: 0, credit: 10000, label: 'Credit' }
        ]
      });

    expect(createResponse.status).toBe(201);
    const entryId = createResponse.body.data.id as string;

    const listResponse = await request(app).get(
      `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/ecritures`
    );
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);

    const lockResponse = await request(app)
      .patch(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/ecritures/${entryId}/verrouiller`)
      .send({ lock: true });
    expect(lockResponse.status).toBe(200);
    expect(lockResponse.body.data.isLocked).toBe(true);
  });

  it('returns the paginated journal with its pagination block', async () => {
    store.entries.set('entry-1', { id: 'entry-1', reference: 'JE-1', isLocked: false });

    const response = await request(app)
      .get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/ecritures`)
      .query({ page: '2', limit: '10', status: 'locked', search: 'JE' });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(mockListEntriesPage).toHaveBeenCalledWith(
      TENANT_ID,
      SYNDIC_ID,
      expect.objectContaining({ page: 2, limit: 10, status: 'locked', search: 'JE' })
    );
  });

  it('passes the search filters of the chart of accounts to the read layer', async () => {
    const response = await request(app)
      .get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/comptes`)
      .query({ search: '401', accountClass: '4,6', limit: '20' });

    expect(response.status).toBe(200);
    expect(mockSearchChartOfAccounts).toHaveBeenCalledWith(
      TENANT_ID,
      SYNDIC_ID,
      expect.objectContaining({ search: '401', accountClass: [4, 6], limit: 20, onlyActive: true })
    );
  });

  it('rejects an invalid page size with 400', async () => {
    const response = await request(app)
      .get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/ecritures`)
      .query({ limit: '1000' });

    expect(response.status).toBe(400);
    expect(mockListEntriesPage).not.toHaveBeenCalled();
  });

  it('returns the aggregated balance with its totals and filtered totals', async () => {
    mockGetTrialBalance.mockResolvedValue({
      items: [
        {
          accountId: ACCOUNT_1_ID,
          accountNumber: '401',
          accountName: 'Fournisseurs',
          accountClass: 4,
          totalDebit: 10000,
          totalCredit: 10000,
          balance: 0
        }
      ],
      totals: { totalDebit: 10000, totalCredit: 10000, isBalanced: true },
      filteredTotals: { totalDebit: 10000, totalCredit: 10000 }
    });

    const response = await request(app)
      .get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/balance`)
      .query({ hideZero: 'true', accountClass: '4' });

    expect(response.status).toBe(200);
    expect(response.body.data.totals.isBalanced).toBe(true);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.filteredTotals).toEqual({ totalDebit: 10000, totalCredit: 10000 });
    expect(mockGetTrialBalance).toHaveBeenCalledWith(
      TENANT_ID,
      SYNDIC_ID,
      expect.objectContaining({ hideZero: true, accountClass: [4] })
    );
  });

  it('returns the ledger of one account with summary, items and pagination', async () => {
    mockGetAccountLedger.mockResolvedValue({
      account: {
        id: ACCOUNT_1_ID,
        accountNumber: '401',
        accountName: 'Fournisseurs',
        accountClass: 4,
        accountType: 'LIABILITY'
      },
      summary: { openingBalance: 0, periodDebit: 10000, periodCredit: 0, closingBalance: 10000, lineCount: 1 },
      items: [
        {
          id: 'line-1',
          entryId: 'entry-1',
          reference: 'JE-1',
          journalCode: 'JG',
          debit: 10000,
          credit: 0,
          runningBalance: 10000
        }
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
    });

    const response = await request(app)
      .get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/grand-livre`)
      .query({ accountId: ACCOUNT_1_ID });

    expect(response.status).toBe(200);
    expect(response.body.data.account.accountNumber).toBe('401');
    expect(response.body.data.summary.closingBalance).toBe(10000);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.pagination.total).toBe(1);
    expect(mockGetAccountLedger).toHaveBeenCalledWith(
      TENANT_ID,
      SYNDIC_ID,
      expect.objectContaining({ accountId: ACCOUNT_1_ID, page: 1, limit: 50 })
    );
  });

  it('rejects the general ledger without accountId with 400', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/grand-livre`);

    expect(response.status).toBe(400);
    expect(mockGetAccountLedger).not.toHaveBeenCalled();
  });

  it('rejects the general ledger with a malformed accountId with 400', async () => {
    const response = await request(app)
      .get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/comptabilite/grand-livre`)
      .query({ accountId: 'pas-un-uuid' });

    expect(response.status).toBe(400);
    expect(mockGetAccountLedger).not.toHaveBeenCalled();
  });
});
