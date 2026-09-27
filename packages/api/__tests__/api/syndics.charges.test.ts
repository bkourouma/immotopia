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

type Charge = {
  id: string;
  tenantId: string;
  syndicateId: string;
  lotId: string;
  period: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  payments: Array<{ amount: number }>;
};

const store = {
  seq: 1,
  charges: new Map<string, Charge>()
};

const TENANT_ID = 'tenant-1';
const TENANT_OTHER_ID = 'tenant-2';
const SYNDIC_ID = '11111111-1111-4111-8111-111111111111';
const SYNDIC_OTHER_ID = '99999999-9999-4999-8999-999999999999';
const LOT_ID = '22222222-2222-4222-8222-222222222222';
const LOT_OTHER_ID = '88888888-8888-4888-8888-888888888888';
const OVERDUE_CHARGE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_TENANT_CHARGE_ID = '44444444-4444-4444-8444-444444444444';

function nextUuidFromSeq(seq: number): string {
  const suffix = String(seq).padStart(12, '0');
  return `55555555-5555-4555-8555-${suffix}`;
}

jest.mock('../../src/lib/syndics/queries', () => ({
  listSyndicatesByTenant: jest.fn(),
  getSyndicateWithLotsAndStats: jest.fn(),
  createSyndicateWithDefaults: jest.fn(),
  createSyndicateLot: jest.fn(),
  updateSyndicateLotByTenant: jest.fn(),
  updateSyndicateByTenant: jest.fn(),
  deleteEmptySyndicateByTenant: jest.fn(),
  listMeetingsBySyndicate: jest.fn(),
  getMeetingByTenant: jest.fn(),
  createMeetingWithResolutions: jest.fn(),
  addResolutionToMeeting: jest.fn(),
  castVoteAndRecomputeResolutionCounters: jest.fn(),
  listServiceProvidersBySyndicate: jest.fn(),
  listMaintenanceContractsBySyndicate: jest.fn(),
  createMaintenanceContract: jest.fn(),
  getMaintenanceContractByTenant: jest.fn(),
  updateMaintenanceContractByTenant: jest.fn(),
  deleteMaintenanceContractByTenant: jest.fn(),
  listDocumentsBySyndicate: jest.fn(),
  getFinanceSummaryBySyndicate: jest.fn(),
  listCommonAssetsBySyndicate: jest.fn(),
  getChargeCallByTenant: jest.fn(async (tenantId: string, _syndicateId: string, chargeId: string) => {
    const charge = store.charges.get(chargeId);
    if (!charge || charge.tenantId !== tenantId) return null;
    return charge;
  }),
  listChargeCallsBySyndicate: jest.fn(
    async (tenantId: string, syndicateId: string, filters?: { period?: string; status?: string }) => {
      return Array.from(store.charges.values()).filter(charge => {
        if (charge.tenantId !== tenantId) return false;
        if (charge.syndicateId !== syndicateId) return false;
        if (filters?.period && charge.period !== filters.period) return false;
        if (filters?.status && charge.status !== filters.status) return false;
        return true;
      });
    }
  ),
  createChargeCallAndUpdateStatus: jest.fn(async (tenantId: string, data: any) => {
    const id = nextUuidFromSeq(store.seq++);
    const created: Charge = {
      id,
      tenantId,
      syndicateId: data.syndicateId,
      lotId: data.lotId,
      period: data.period,
      amount: data.amount,
      currency: data.currency,
      dueDate: data.dueDate.toISOString(),
      status: 'PENDING',
      payments: []
    };
    store.charges.set(id, created);
    return created;
  }),
  recordChargePaymentWithStatusUpdate: jest.fn(async (tenantId: string, data: any) => {
    const charge = store.charges.get(data.chargeCallId);
    if (!charge || charge.tenantId !== tenantId) {
      const err: any = new Error('Appel de charges introuvable ou inaccessible');
      err.status = 404;
      throw err;
    }

    charge.payments.push({ amount: data.amount });
    const totalPaid = charge.payments.reduce((sum, item) => sum + Number(item.amount), 0);
    if (totalPaid >= Number(charge.amount)) charge.status = 'PAID';
    else if (totalPaid > 0) charge.status = 'PARTIAL';
    else charge.status = 'PENDING';

    return { id: `payment-${Date.now()}`, chargeCallId: charge.id, amount: data.amount };
  })
}));

jest.mock('../../src/lib/syndics/notifications', () => ({
  notifyChargeCall: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false })
}));

import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

describe('Syndics charges routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', syndicRoutes);
  // Sans ce middleware, une erreur typee (throw + asyncHandler) tombe sur le
  // gestionnaire par defaut d'Express : corps JSON vide, statut potentiellement
  // errone. Voir __tests__/api/syndics.accounting.characterization.test.ts.
  app.use(errorHandler);

  beforeEach(() => {
    store.seq = 1;
    store.charges.clear();
    store.charges.set('charge-overdue-1', {
      id: OVERDUE_CHARGE_ID,
      tenantId: TENANT_ID,
      syndicateId: SYNDIC_ID,
      lotId: LOT_ID,
      period: '2026-Q1',
      amount: 50000,
      currency: 'XOF',
      dueDate: new Date('2026-01-10T00:00:00.000Z').toISOString(),
      status: 'OVERDUE',
      payments: []
    });
    store.charges.set(OTHER_TENANT_CHARGE_ID, {
      id: OTHER_TENANT_CHARGE_ID,
      tenantId: TENANT_OTHER_ID,
      syndicateId: SYNDIC_OTHER_ID,
      lotId: LOT_OTHER_ID,
      period: '2026-Q1',
      amount: 75000,
      currency: 'XOF',
      dueDate: new Date('2026-02-10T00:00:00.000Z').toISOString(),
      status: 'PENDING',
      payments: []
    });
  });

  it('creates charge call with PENDING status', async () => {
    const response = await request(app).post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/charges`).send({
      lotId: LOT_ID,
      period: '2026-Q2',
      amount: 100000,
      currency: 'XOF',
      dueDate: '2026-06-15T00:00:00.000Z'
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('PENDING');
  });

  it('transitions charge status from PENDING to PARTIAL to PAID', async () => {
    const create = await request(app).post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/charges`).send({
      lotId: LOT_ID,
      period: '2026-Q2',
      amount: 100000,
      currency: 'XOF',
      dueDate: '2026-06-15T00:00:00.000Z'
    });

    const chargeId = create.body.data.id as string;

    const pay1 = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/charges/${chargeId}/pay`)
      .send({ amount: 30000, paidAt: '2026-06-01T00:00:00.000Z', method: 'VIREMENT' });
    expect(pay1.status).toBe(201);
    expect(store.charges.get(chargeId)?.status).toBe('PARTIAL');

    const pay2 = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/charges/${chargeId}/pay`)
      .send({ amount: 70000, paidAt: '2026-06-02T00:00:00.000Z', method: 'VIREMENT' });
    expect(pay2.status).toBe(201);
    expect(store.charges.get(chargeId)?.status).toBe('PAID');
  });

  it('lists overdue charge calls with OVERDUE filter', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/charges?status=OVERDUE`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].status).toBe('OVERDUE');
  });

  it('forwards page and limit query params to the service so the full list can be paged through', async () => {
    const { listChargeCallsBySyndicate } = jest.requireMock('../../src/lib/syndics/queries') as {
      listChargeCallsBySyndicate: jest.Mock;
    };
    listChargeCallsBySyndicate.mockClear();

    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/charges?page=2&limit=100`);

    expect(response.status).toBe(200);
    expect(listChargeCallsBySyndicate).toHaveBeenCalledWith(
      TENANT_ID,
      SYNDIC_ID,
      expect.objectContaining({ pagination: { page: 2, limit: 100 } })
    );
  });

  it('enforces tenant isolation when paying a charge call', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/charges/${OTHER_TENANT_CHARGE_ID}/pay`)
      .send({ amount: 10000, paidAt: '2026-06-03T00:00:00.000Z' });

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
