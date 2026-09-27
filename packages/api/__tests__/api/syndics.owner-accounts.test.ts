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
const LOT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_LOT_ID = '99999999-9999-4999-8999-999999999999';

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
  getOwnerAccountByLot: jest.fn(async (_tenantId: string, _syndicId: string, lotId: string) => {
    if (lotId === OTHER_LOT_ID) {
      const err: any = new Error('Compte lot introuvable ou lot sans proprietaire');
      err.status = 404;
      throw err;
    }
    return {
      id: 'acc-1',
      lotId,
      balance: 35000,
      currency: 'XOF',
      lot: { id: LOT_ID, lotNumber: 'A-01' },
      contact: { id: 'contact-1', firstName: 'Awa', lastName: 'Diop' }
    };
  }),
  listOwnerAccountTransactionsByLot: jest.fn(async (_tenantId: string, _syndicId: string, lotId: string) => {
    if (lotId === OTHER_LOT_ID) return [];
    return [
      { id: 'tx-1', type: 'CHARGE_CALL', label: 'Appel', debit: 10000, credit: null, balanceAfter: 45000 },
      { id: 'tx-2', type: 'PAYMENT', label: 'Paiement', debit: null, credit: 10000, balanceAfter: 35000 }
    ];
  }),
  createOwnerAccountAdjustmentByLot: jest.fn(async (_tenantId: string, _syndicId: string, lotId: string, data: any) => {
    if (lotId === OTHER_LOT_ID) {
      const err: any = new Error('Compte lot introuvable ou lot sans proprietaire');
      err.status = 404;
      throw err;
    }
    return {
      id: 'tx-adj-1',
      type: 'ADJUSTMENT',
      label: data.label,
      debit: data.direction === 'DEBIT' ? data.amount : null,
      credit: data.direction === 'CREDIT' ? data.amount : null,
      balanceAfter: 40000
    };
  }),
  getOwnerAccountStatementByLot: jest.fn(async (_tenantId: string, _syndicId: string, lotId: string) => {
    if (lotId === OTHER_LOT_ID) {
      const err: any = new Error('Compte lot introuvable ou lot sans proprietaire');
      err.status = 404;
      throw err;
    }
    return {
      account: {
        id: 'acc-1',
        currency: 'XOF',
        syndicate: { name: 'Residence Demo' },
        lot: { lotNumber: 'A-01' },
        contact: { firstName: 'Awa', lastName: 'Diop', legalName: null }
      },
      transactions: [
        {
          transactionDate: new Date('2026-01-10T00:00:00.000Z'),
          type: 'CHARGE_CALL',
          label: 'Appel',
          debit: 10000,
          credit: null,
          balanceAfter: 45000
        }
      ],
      summary: { openingBalance: 35000, closingBalance: 45000 }
    };
  })
}));

jest.mock('../../src/lib/syndics/notifications', () => ({
  notifyChargeCall: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false }),
  notifyMeetingConvocation: jest.fn().mockResolvedValue({ emailSent: 0, whatsappSent: 0 }),
  notifyChargeCallReminder: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false })
}));

jest.mock('../../src/lib/syndics/owner-account-statement', () => ({
  buildOwnerAccountStatementPdf: jest.fn().mockResolvedValue(Buffer.from('PDF-STATEMENT'))
}));

import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

describe('Syndics owner accounts routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', syndicRoutes);
  // Sans ce middleware, une erreur typee (throw + asyncHandler) tombe sur le
  // gestionnaire par defaut d'Express : corps JSON vide, statut potentiellement
  // errone. Voir __tests__/api/syndics.accounting.characterization.test.ts.
  app.use(errorHandler);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gets owner account for a lot', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/lots/${LOT_ID}/compte`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe('acc-1');
  });

  it('lists lot account transactions', async () => {
    const response = await request(app).get(
      `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/lots/${LOT_ID}/compte/transactions`
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(2);
  });

  it('creates manual account adjustment', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/lots/${LOT_ID}/compte/ajustements`)
      .send({
        direction: 'DEBIT',
        amount: 5000,
        label: 'Regularisation'
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.type).toBe('ADJUSTMENT');
  });

  it('downloads lot account statement pdf', async () => {
    const response = await request(app).get(
      `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/lots/${LOT_ID}/compte/releve`
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('attachment');
  });

  it('enforces tenant isolation for unknown lot account', async () => {
    const response = await request(app).get(
      `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/lots/${OTHER_LOT_ID}/compte`
    );

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
