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

type Reminder = {
  id: string;
  tenantId: string;
  syndicateId: string;
  chargeCallId: string;
  lotId: string;
  reminderLevel: number;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';
  status: 'SENT' | 'DELIVERED' | 'FAILED';
  sentAt: string;
};

type Penalty = {
  id: string;
  tenantId: string;
  syndicateId: string;
  chargeCallId: string;
  lotId: string;
  daysLate: number;
  penaltyRate: number;
  penaltyAmount: number;
  waived: boolean;
  waivedReason?: string;
};

const TENANT_ID = 'tenant-1';
const SYNDIC_ID = '11111111-1111-4111-8111-111111111111';
const LOT_ID = '22222222-2222-4222-8222-222222222222';
const CHARGE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_CHARGE_ID = '44444444-4444-4444-8444-444444444444';

const store = {
  reminderSeq: 1,
  penaltySeq: 1,
  reminders: new Map<string, Reminder>(),
  penalties: new Map<string, Penalty>()
};

function nextReminderId(seq: number): string {
  const suffix = String(seq).padStart(12, '0');
  return `77777777-7777-4777-8777-${suffix}`;
}

function nextPenaltyId(seq: number): string {
  const suffix = String(seq).padStart(12, '0');
  return `88888888-8888-4888-8888-${suffix}`;
}

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
  listOverdueDashboardBySyndicate: jest.fn(async (tenantId: string, syndicateId: string) => {
    if (tenantId !== TENANT_ID || syndicateId !== SYNDIC_ID)
      return { items: [], totals: { overdueCount: 0, overdueAmount: 0 } };
    return {
      items: [
        {
          chargeCallId: CHARGE_ID,
          lotId: LOT_ID,
          lotNumber: 'A-01',
          owner: { id: 'owner-1', firstName: 'Awa', lastName: 'Diop', email: 'awa@example.com' },
          dueDate: new Date('2026-01-10T00:00:00.000Z'),
          status: 'OVERDUE',
          amount: 100000,
          paid: 20000,
          outstanding: 80000,
          daysLate: 20
        }
      ],
      totals: { overdueCount: 1, overdueAmount: 80000 }
    };
  }),
  listPaymentRemindersBySyndicate: jest.fn(async (tenantId: string, syndicateId: string) =>
    Array.from(store.reminders.values()).filter(r => r.tenantId === tenantId && r.syndicateId === syndicateId)
  ),
  createManualReminderForChargeCall: jest.fn(
    async (tenantId: string, syndicateId: string, chargeCallId: string, data: any) => {
      if (tenantId !== TENANT_ID || syndicateId !== SYNDIC_ID || chargeCallId !== CHARGE_ID) {
        const err: any = new Error('Appel de charges introuvable ou inaccessible');
        err.status = 404;
        throw err;
      }
      const id = nextReminderId(store.reminderSeq++);
      const reminder: Reminder = {
        id,
        tenantId,
        syndicateId,
        chargeCallId,
        lotId: LOT_ID,
        reminderLevel: data.reminderLevel ?? 1,
        channel: data.channel ?? 'EMAIL',
        status: data.status ?? 'SENT',
        sentAt: new Date().toISOString()
      };
      store.reminders.set(id, reminder);
      return reminder;
    }
  ),
  runReminderBatchForSyndicate: jest.fn(async (tenantId: string, syndicateId: string) => {
    if (tenantId !== TENANT_ID || syndicateId !== SYNDIC_ID) {
      return { processedCalls: 0, remindersCreated: 0, createdReminderIds: [] };
    }
    const id = nextReminderId(store.reminderSeq++);
    store.reminders.set(id, {
      id,
      tenantId,
      syndicateId,
      chargeCallId: CHARGE_ID,
      lotId: LOT_ID,
      reminderLevel: 1,
      channel: 'EMAIL',
      status: 'SENT',
      sentAt: new Date().toISOString()
    });
    return { processedCalls: 1, remindersCreated: 1, createdReminderIds: [id] };
  }),
  listLatePaymentPenaltiesBySyndicate: jest.fn(async (tenantId: string, syndicateId: string) =>
    Array.from(store.penalties.values()).filter(p => p.tenantId === tenantId && p.syndicateId === syndicateId)
  ),
  createLatePaymentPenaltyForChargeCall: jest.fn(
    async (tenantId: string, syndicateId: string, chargeCallId: string, data: any) => {
      if (tenantId !== TENANT_ID || syndicateId !== SYNDIC_ID || chargeCallId !== CHARGE_ID) {
        const err: any = new Error('Appel de charges introuvable ou inaccessible');
        err.status = 404;
        throw err;
      }
      const id = nextPenaltyId(store.penaltySeq++);
      const penalty: Penalty = {
        id,
        tenantId,
        syndicateId,
        chargeCallId,
        lotId: LOT_ID,
        daysLate: data.daysLate ?? 10,
        penaltyRate: data.penaltyRate,
        penaltyAmount: data.penaltyAmount ?? 1500,
        waived: false
      };
      store.penalties.set(id, penalty);
      return penalty;
    }
  ),
  waiveLatePaymentPenaltyByTenant: jest.fn(
    async (tenantId: string, syndicateId: string, penaltyId: string, waivedReason: string) => {
      const penalty = store.penalties.get(penaltyId);
      if (!penalty || penalty.tenantId !== tenantId || penalty.syndicateId !== syndicateId) {
        const err: any = new Error('Penalite introuvable ou inaccessible');
        err.status = 404;
        throw err;
      }
      penalty.waived = true;
      penalty.waivedReason = waivedReason;
      return penalty;
    }
  ),
  createPaymentScheduleForChargeCall: jest.fn(
    async (tenantId: string, syndicateId: string, chargeCallId: string, data: any) => {
      if (tenantId !== TENANT_ID || syndicateId !== SYNDIC_ID || chargeCallId !== CHARGE_ID) {
        const err: any = new Error('Appel de charges introuvable ou inaccessible');
        err.status = 404;
        throw err;
      }
      return {
        id: 'sched-1',
        chargeCallId,
        lotId: LOT_ID,
        totalAmount: data.totalAmount,
        status: 'ACTIVE',
        instalments: data.instalments.map((i: any, index: number) => ({
          id: `inst-${index + 1}`,
          dueDate: i.dueDate,
          amount: i.amount,
          status: 'PENDING'
        }))
      };
    }
  )
}));

jest.mock('../../src/lib/syndics/notifications', () => ({
  notifyChargeCall: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false }),
  notifyMeetingConvocation: jest.fn().mockResolvedValue({ emailSent: 0, whatsappSent: 0 }),
  notifyChargeCallReminder: jest.fn().mockResolvedValue({ emailSent: true, whatsappSent: false })
}));

import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
const mockNotifications = jest.requireMock('../../src/lib/syndics/notifications') as Record<string, jest.Mock>;

describe('Syndics recovery routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', syndicRoutes);
  // Sans ce middleware, une erreur typee (throw + asyncHandler) tombe sur le
  // gestionnaire par defaut d'Express : corps JSON vide, statut potentiellement
  // errone. Voir __tests__/api/syndics.accounting.characterization.test.ts.
  app.use(errorHandler);

  beforeEach(() => {
    store.reminderSeq = 1;
    store.penaltySeq = 1;
    store.reminders.clear();
    store.penalties.clear();
    jest.clearAllMocks();
  });

  it('returns overdue dashboard', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/retards`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.totals.overdueCount).toBe(1);
  });

  it('creates a manual reminder and triggers notification', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/charges/${CHARGE_ID}/relance`)
      .send({ reminderLevel: 1, channel: 'EMAIL' });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(mockNotifications.notifyChargeCallReminder).toHaveBeenCalledTimes(1);
  });

  it('runs reminder batch and triggers notifications', async () => {
    const response = await request(app).post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/relances/batch`).send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.remindersCreated).toBe(1);
    expect(mockNotifications.notifyChargeCallReminder).toHaveBeenCalledTimes(1);
  });

  it('creates and waives a penalty', async () => {
    const createResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/charges/${CHARGE_ID}/penalite`)
      .send({ penaltyRate: 5 });

    expect(createResponse.status).toBe(201);
    const penaltyId = createResponse.body.data.id as string;

    const waiveResponse = await request(app)
      .patch(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/penalites/${penaltyId}/remise`)
      .send({ waivedReason: 'Accord amiable' });

    expect(waiveResponse.status).toBe(200);
    expect(waiveResponse.body.data.waived).toBe(true);
  });

  it('creates payment schedule', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/charges/${CHARGE_ID}/echeancier`)
      .send({
        totalAmount: 80000,
        instalments: [
          { dueDate: '2026-04-10T00:00:00.000Z', amount: 40000 },
          { dueDate: '2026-05-10T00:00:00.000Z', amount: 40000 }
        ]
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.instalments).toHaveLength(2);
  });

  it('enforces tenant isolation on manual reminder', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/charges/${OTHER_CHARGE_ID}/relance`)
      .send({ reminderLevel: 1 });

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
