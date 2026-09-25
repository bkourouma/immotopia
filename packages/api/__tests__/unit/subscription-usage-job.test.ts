/**
 * Tache planifiee des abonnements (jobs/subscription-usage-job.ts, vague 2,
 * lot B) : seuils d'alerte 80 / 100 % une fois par periode, rappels de fin
 * d'essai J-7 et J-1, passage PAST_DUE a l'echeance sans paiement puis
 * lecture seule, releves quotidiens, transitions d'elements a l'echeance.
 * Faux client Prisma en memoire, aucune base, aucun e-mail reel.
 */

import { Prisma } from '@prisma/client';

type Row = Record<string, any>;

const mockState: {
  subscriptions: Row[];
  invoices: Row[];
  snapshots: Row[];
  alerts: Row[];
  entitlements: Row;
} = { subscriptions: [], invoices: [], snapshots: [], alerts: [], entitlements: {} };

const mockFake: Row = {
  subscription: {
    findUnique: jest.fn(async ({ where }: Row) =>
      mockState.subscriptions.find(s => (where.id ? s.id === where.id : s.tenantId === where.tenantId)) ?? null
    ),
    findMany: jest.fn(async ({ where }: Row) =>
      mockState.subscriptions.filter(s => where.status.in.includes(s.status) && (!where.tenantId || s.tenantId === where.tenantId))
    ),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = mockState.subscriptions.find(s => s.id === where.id)!;
      Object.assign(row, data);
      return row;
    })
  },
  invoice: {
    findFirst: jest.fn(async ({ where }: Row) =>
      mockState.invoices.find(
        i =>
          i.subscriptionId === where.subscriptionId &&
          i.status === where.status &&
          i.periodStart.getTime() >= where.periodStart.gte.getTime() &&
          i.periodStart.getTime() < where.periodStart.lt.getTime()
      ) ?? null
    )
  },
  usageSnapshot: {
    findUnique: jest.fn(async ({ where }: Row) => {
      const k = where.tenantId_capacityKey_snapshotDate;
      return (
        mockState.snapshots.find(
          s => s.tenantId === k.tenantId && s.capacityKey === k.capacityKey && s.snapshotDate.getTime() === k.snapshotDate.getTime()
        ) ?? null
      );
    }),
    upsert: jest.fn(async ({ where, create, update }: Row) => {
      const k = where.tenantId_capacityKey_snapshotDate;
      const row = mockState.snapshots.find(
        s => s.tenantId === k.tenantId && s.capacityKey === k.capacityKey && s.snapshotDate.getTime() === k.snapshotDate.getTime()
      );
      if (row) return Object.assign(row, update);
      mockState.snapshots.push({ ...create });
      return create;
    })
  },
  quotaAlert: {
    create: jest.fn(async ({ data }: Row) => {
      const dup = mockState.alerts.find(
        a =>
          a.tenantId === data.tenantId &&
          a.capacityKey === data.capacityKey &&
          a.threshold === data.threshold &&
          a.periodStart.getTime() === data.periodStart.getTime()
      );
      if (dup) {
        throw new (jest.requireActual('@prisma/client').Prisma.PrismaClientKnownRequestError)('dup', {
          code: 'P2002',
          clientVersion: 'test'
        });
      }
      const row = { id: `alert-${mockState.alerts.length + 1}`, notifiedAt: null, ...data };
      mockState.alerts.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: Row) => Object.assign(mockState.alerts.find(a => a.id === where.id)!, data)),
    findMany: jest.fn(async () => mockState.alerts)
  },
  tenant: { findUnique: jest.fn(async () => ({ name: 'Ivoire Résidences', contactEmail: 'contact@ivoire.test' })) },
  role: { findUnique: jest.fn(async () => ({ id: 'role-admin' })) },
  userRole: { findMany: jest.fn(async () => [{ userId: 'u-admin' }]) },
  user: {
    findMany: jest.fn(async ({ where }: Row) =>
      where.globalRole === 'SUPER_ADMIN'
        ? [{ email: 'root@immotopia.test', fullName: 'Super Admin' }]
        : [{ email: 'admin@ivoire.test', fullName: 'Admin Ivoire' }]
    )
  },
  $transaction: async (cb: (tx: Row) => Promise<unknown>) => cb(mockFake)
};

jest.mock('../../src/utils/database', () => ({
  get prisma() {
    return mockFake;
  }
}));

jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: jest.fn(async () => undefined) } }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/subscription-v2-service', () => {
  const actual = jest.requireActual('../../src/services/subscription-v2-service');
  return {
    monthlyOverageWindow: actual.monthlyOverageWindow,
    getEntitlements: jest.fn(async () => mockState.entitlements),
    invalidateEntitlements: jest.fn(),
    applyDueItemTransitionsTx: jest.fn(async () => ({ ended: 0, started: 0 }))
  };
});

import {
  crossedThresholds,
  dueTrialReminder,
  evaluateQuotaAlerts,
  processBillingBoundary,
  recordUsageSnapshots,
  runSubscriptionUsageCycle,
  sendTrialReminders
} from '../../src/jobs/subscription-usage-job';

const { emailService } = jest.requireMock('../../src/services/email-service') as { emailService: { sendEmail: jest.Mock } };
const subscriptionService = jest.requireMock('../../src/services/subscription-v2-service') as {
  applyDueItemTransitionsTx: jest.Mock;
};

const T = 'tenant-ivoire';
const DAY = 24 * 60 * 60 * 1000;

function capacities(lots: { used: number; limit: number }, copro = { used: 0, limit: 0 }) {
  const cap = (c: { used: number; limit: number }) => ({ included: c.limit, extensions: 0, overrides: 0, ...c, remaining: 0, overBy: 0 });
  return { LOTS: cap(lots), COPROPRIETES: cap(copro), CHANTIERS: cap({ used: 0, limit: 0 }) };
}

function seedSubscription(sub: Row) {
  mockState.subscriptions.push({
    id: 'sub-1',
    tenantId: T,
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
    trialEndsAt: null,
    pastDueAt: null,
    graceDays: 7,
    metadata: null,
    ...sub
  });
  return mockState.subscriptions[mockState.subscriptions.length - 1];
}

beforeEach(() => {
  mockState.subscriptions = [];
  mockState.invoices = [];
  mockState.snapshots = [];
  mockState.alerts = [];
  mockState.entitlements = {
    phase: 'ACTIVE',
    readOnly: false,
    readOnlyReason: null,
    graceEndsAt: null,
    quotaPolicy: 'BILL_OVERAGE',
    capacities: capacities({ used: 50, limit: 100 })
  };
  emailService.sendEmail.mockClear();
  subscriptionService.applyDueItemTransitionsTx.mockClear();
});

describe('seuils d’alerte', () => {
  it('80 % et 100 %, capacite nulle entamee = 100 %', () => {
    expect(crossedThresholds(79, 100)).toEqual([]);
    expect(crossedThresholds(80, 100)).toEqual([80]);
    expect(crossedThresholds(130, 100)).toEqual([80, 100]);
    expect(crossedThresholds(1, 0)).toEqual([80, 100]);
    expect(crossedThresholds(0, 0)).toEqual([]);
  });

  it('une seule alerte par seuil et par periode, e-mail a l’agence ET au super-admin', async () => {
    seedSubscription({});
    const now = new Date('2026-09-16T10:00:00Z');
    mockState.entitlements.capacities = capacities({ used: 85, limit: 100 });

    expect(await evaluateQuotaAlerts(T, now)).toEqual([{ capacityKey: 'LOTS', threshold: 80, used: 85, limit: 100 }]);
    expect(emailService.sendEmail.mock.calls.map(c => c[0].to)).toEqual(['admin@ivoire.test', 'root@immotopia.test']);
    expect(mockState.alerts[0].notifiedAt).toBeInstanceOf(Date);

    // Rejouee : rien de neuf.
    emailService.sendEmail.mockClear();
    expect(await evaluateQuotaAlerts(T, now)).toEqual([]);
    expect(emailService.sendEmail).not.toHaveBeenCalled();

    // Le 100 % arrive plus tard dans la meme periode : seul lui part.
    mockState.entitlements.capacities = capacities({ used: 101, limit: 100 });
    expect((await evaluateQuotaAlerts(T, now)).map(a => a.threshold)).toEqual([100]);

    // Periode suivante : les seuils se rearment.
    mockState.subscriptions[0].currentPeriodStart = new Date('2026-10-01T00:00:00Z');
    expect((await evaluateQuotaAlerts(T, new Date('2026-10-02T00:00:00Z'))).map(a => a.threshold)).toEqual([80, 100]);
  });

  it('en ANNUEL, la periode d’alerte est la fenetre MENSUELLE de depassement', async () => {
    seedSubscription({
      billingCycle: 'ANNUAL',
      currentPeriodStart: new Date('2026-01-15T00:00:00Z'),
      currentPeriodEnd: new Date('2027-01-15T00:00:00Z')
    });
    mockState.entitlements.capacities = capacities({ used: 90, limit: 100 });
    await evaluateQuotaAlerts(T, new Date('2026-09-16T00:00:00Z'));
    await evaluateQuotaAlerts(T, new Date('2026-10-16T00:00:00Z'));
    expect(mockState.alerts.map(a => a.periodStart.toISOString().slice(0, 10))).toEqual(['2026-09-15', '2026-10-15']);
  });
});

describe('releve quotidien', () => {
  it('une ligne par capacite et par jour, qui garde le pic', async () => {
    seedSubscription({});
    const morning = new Date('2026-09-16T08:00:00Z');
    mockState.entitlements.capacities = capacities({ used: 120, limit: 100 });
    await recordUsageSnapshots(T, morning);
    mockState.entitlements.capacities = capacities({ used: 110, limit: 100 });
    await recordUsageSnapshots(T, new Date('2026-09-16T20:00:00Z'));
    const lots = mockState.snapshots.filter(s => s.capacityKey === 'LOTS');
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ used: 120, limit: 100, overage: 20 });
    expect(mockState.snapshots).toHaveLength(3);
  });
});

describe('rappels de fin d’essai', () => {
  const END = new Date('2026-10-25T00:00:00Z');

  it('J-7 puis J-1, une seule fois chacun', async () => {
    expect(dueTrialReminder(END, new Date(END.getTime() - 10 * DAY))).toBeNull();
    expect(dueTrialReminder(END, new Date(END.getTime() - 7 * DAY))).toBe(7);
    expect(dueTrialReminder(END, new Date(END.getTime() - 3 * DAY))).toBe(7);
    expect(dueTrialReminder(END, new Date(END.getTime() - 12 * 60 * 60 * 1000))).toBe(1);
    expect(dueTrialReminder(END, new Date(END.getTime() + DAY))).toBeNull();

    seedSubscription({ status: 'TRIALING', trialEndsAt: END, currentPeriodEnd: END });
    expect(await sendTrialReminders(T, new Date(END.getTime() - 6 * DAY))).toBe(7);
    expect(await sendTrialReminders(T, new Date(END.getTime() - 5 * DAY))).toBeNull();
    expect(await sendTrialReminders(T, new Date(END.getTime() - 20 * 60 * 60 * 1000))).toBe(1);
    expect(await sendTrialReminders(T, new Date(END.getTime() - 60 * 60 * 1000))).toBeNull();
    const subjects = emailService.sendEmail.mock.calls.filter(c => c[0].to === 'admin@ivoire.test').map(c => c[0].subject);
    expect(subjects).toEqual(['Votre essai ImmoTopia se termine dans 7 jours', 'Votre essai ImmoTopia se termine demain']);
  });

  it('un essai prolonge relance les rappels', async () => {
    seedSubscription({ status: 'TRIALING', trialEndsAt: END, currentPeriodEnd: END });
    await sendTrialReminders(T, new Date(END.getTime() - 6 * DAY));
    const later = new Date(END.getTime() + 14 * DAY);
    mockState.subscriptions[0].trialEndsAt = later;
    expect(await sendTrialReminders(T, new Date(later.getTime() - 6 * DAY))).toBe(7);
  });
});

describe('echeance : PAST_DUE, renouvellement, lecture seule (D8)', () => {
  it('fin d’essai sans paiement -> PAST_DUE a la date de fin, transitions appliquees, agence prevenue', async () => {
    const END = new Date('2026-10-25T00:00:00Z');
    seedSubscription({ status: 'TRIALING', trialEndsAt: END, currentPeriodEnd: END });
    const outcome = await processBillingBoundary('sub-1', new Date(END.getTime() + 60 * 60 * 1000));
    expect(outcome.action).toBe('PAST_DUE');
    expect(mockState.subscriptions[0]).toMatchObject({ status: 'PAST_DUE', pastDueAt: END });
    expect(subscriptionService.applyDueItemTransitionsTx).toHaveBeenCalled();
    expect(emailService.sendEmail.mock.calls.map(c => c[0].subject)).toContain('Votre essai ImmoTopia est terminé');
  });

  it('periode active echue avec une facture PAYEE pour la suite -> periode avancee, pas d’impaye', async () => {
    const END = new Date('2026-10-01T00:00:00Z');
    seedSubscription({});
    mockState.invoices.push({ subscriptionId: 'sub-1', status: 'PAID', periodStart: END });
    const outcome = await processBillingBoundary('sub-1', new Date('2026-10-01T03:00:00Z'));
    expect(outcome.action).toBe('RENEWED');
    expect(mockState.subscriptions[0]).toMatchObject({
      status: 'ACTIVE',
      currentPeriodStart: END,
      currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
      pastDueAt: null
    });
  });

  it('avant l’echeance : rien ne change', async () => {
    seedSubscription({});
    expect((await processBillingBoundary('sub-1', new Date('2026-09-20T00:00:00Z'))).action).toBe('NONE');
    expect(mockState.subscriptions[0].status).toBe('ACTIVE');
  });

  it('apres 7 jours de grace : lecture seule, prevenue UNE fois', async () => {
    const pastDueAt = new Date('2026-10-01T00:00:00Z');
    seedSubscription({ status: 'PAST_DUE', pastDueAt });
    mockState.entitlements = {
      ...mockState.entitlements,
      phase: 'READ_ONLY',
      readOnly: true,
      readOnlyReason: 'PAST_DUE',
      graceEndsAt: new Date(pastDueAt.getTime() + 7 * DAY)
    };
    const now = new Date('2026-10-09T00:00:00Z');
    expect((await processBillingBoundary('sub-1', now)).readOnlyNotified).toBe(true);
    expect((await processBillingBoundary('sub-1', now)).readOnlyNotified).toBe(false);
    const subjects = emailService.sendEmail.mock.calls.map(c => c[0].subject);
    expect(subjects.filter(s => s === 'Votre espace ImmoTopia est en lecture seule')).toHaveLength(1);
  });
});

describe('passage complet', () => {
  it('echeance + releves + alertes + rappels, erreurs isolees par agence', async () => {
    const END = new Date('2026-10-01T00:00:00Z');
    seedSubscription({});
    mockState.entitlements.capacities = capacities({ used: 100, limit: 100 });
    const report = await runSubscriptionUsageCycle({ now: new Date(END.getTime() + DAY) });
    expect(report).toMatchObject({ tenants: 1, pastDue: 1, renewed: 0, snapshots: 3, alerts: 2, errors: [] });
  });

  it('alertes seules (passage horaire) : ni echeance ni releve', async () => {
    seedSubscription({});
    mockState.entitlements.capacities = capacities({ used: 90, limit: 100 });
    const report = await runSubscriptionUsageCycle({ now: new Date('2026-10-05T00:00:00Z'), alertsOnly: true });
    expect(report).toMatchObject({ pastDue: 0, snapshots: 0, alerts: 1 });
    expect(mockState.subscriptions[0].status).toBe('ACTIVE');
  });
});

// Garde-fou de type : l'erreur d'unicite simulee est bien celle de Prisma.
it('le faux client leve une P2002 Prisma sur une alerte en double', async () => {
  const data = { tenantId: T, capacityKey: 'LOTS', threshold: 80, periodStart: new Date(0), used: 1, limit: 1 };
  await mockFake.quotaAlert.create({ data });
  await expect(mockFake.quotaAlert.create({ data })).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
});
