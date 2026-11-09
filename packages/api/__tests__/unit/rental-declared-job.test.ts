/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 049, lot 1 : tâches horaire et quotidienne du paiement de loyer déclaré
 * (`lib/rental/declared-payment/job-logic.ts` + planification dans `jobs/rental-declared-payment-job.ts`).
 */

jest.mock('node-cron', () => ({ schedule: jest.fn(() => ({ stop: jest.fn() })) }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const contexts: string[] = [];
jest.mock('../../src/utils/tenant-context', () => ({
  runWithTenantContext: (context: { tenantId: string }, fn: () => unknown) => {
    contexts.push(context.tenantId);
    return fn();
  }
}));

const declarationFindMany = jest.fn();
const declarationUpdateMany = jest.fn(async (..._a: any[]) => ({ count: 1 }));
jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalPaymentDeclaration: {
      findMany: (...a: any[]) => declarationFindMany(...a),
      updateMany: (...a: any[]) => declarationUpdateMany(...a)
    }
  }
}));

// Verrou consultatif + marqueur anti-doublon : verrou simulé, marqueurs en mémoire.
const markers: any[] = [];
jest.mock('../../src/lib/ai/advisory-lock', () => ({
  withTransactionalAdvisoryLock: async (_key: string, fn: (tx: any) => Promise<unknown>) =>
    fn({
      notificationMarker: {
        findFirst: async ({ where }: any) =>
          markers.find(m => m.tenantId === where.tenantId && m.kind === where.kind && m.entityId === where.entityId) ??
          null,
        create: async ({ data }: any) => {
          markers.push(data);
          return data;
        }
      }
    })
}));

const sendReviewSummary = jest.fn();
const sendOverdueAlert = jest.fn();
jest.mock('../../src/lib/rental/declared-payment/notifications', () => ({
  sendReviewSummary: (...a: any[]) => sendReviewSummary(...a),
  sendOverdueAlert: (...a: any[]) => sendOverdueAlert(...a)
}));

const purgeExpiredProofReads = jest.fn();
jest.mock(
  '../../src/lib/rental/declared-payment/proof-read-purge',
  () => ({ purgeExpiredProofReads: (...a: any[]) => purgeExpiredProofReads(...a) }),
  { virtual: true }
);

const loadDeclaredPaymentSettings = jest.fn();
jest.mock('../../src/lib/rental/declared-payment/settings', () => ({
  loadDeclaredPaymentSettings: (...a: any[]) => loadDeclaredPaymentSettings(...a)
}));

import * as cron from 'node-cron';
import {
  runDailyOverdueAlert,
  runHourlyDeclarationBatch,
  startOfHour
} from '../../src/lib/rental/declared-payment/job-logic';
import {
  startRentalDeclaredPaymentJob,
  stopRentalDeclaredPaymentJob
} from '../../src/jobs/rental-declared-payment-job';

// Lundi 19 octobre 2026, 10:07 UTC.
const NOW = new Date('2026-10-19T10:07:00Z');
const TENANTS = [{ tenant_id: 'tenant-A' }, { tenant_id: 'tenant-B' }];

/** `findMany` : les groupes (distinct) puis les PENDING de chaque agence. */
function stubDeclarations(pendingByTenant: Record<string, Array<{ id?: string; amount?: number; at: string }>>) {
  declarationFindMany.mockImplementation(async (args: any) => {
    if (args.distinct) return TENANTS;
    return (pendingByTenant[args.where.tenant_id] ?? []).map((row, i) => ({
      id: row.id ?? `d-${args.where.tenant_id}-${i}`,
      amount: row.amount ?? 50000,
      created_at: new Date(row.at)
    }));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  contexts.length = 0;
  markers.length = 0;
  loadDeclaredPaymentSettings.mockResolvedValue({ reviewAlertBusinessDays: 3 });
  sendReviewSummary.mockResolvedValue(2);
  sendOverdueAlert.mockResolvedValue(2);
  purgeExpiredProofReads.mockResolvedValue(0);
});

describe('passage horaire', () => {
  it('startOfHour tronque à l’heure pleine UTC', () => {
    expect(startOfHour(NOW).toISOString()).toBe('2026-10-19T10:00:00.000Z');
  });

  it('regroupe : UN récapitulatif par agence ayant reçu une déclaration pendant l’heure précédente', async () => {
    stubDeclarations({
      'tenant-A': [{ at: '2026-10-19T09:10:00Z' }, { at: '2026-10-19T09:40:00Z' }],
      'tenant-B': [{ at: '2026-10-19T09:59:00Z' }]
    });
    const report = await runHourlyDeclarationBatch(NOW);

    const groupsQuery = declarationFindMany.mock.calls.find(([args]) => args.distinct)![0];
    expect(groupsQuery.where.status).toBe('PENDING');
    expect(groupsQuery.where.created_at.gte.toISOString()).toBe('2026-10-19T09:00:00.000Z');
    expect(groupsQuery.where.created_at.lt.toISOString()).toBe('2026-10-19T10:00:00.000Z');

    expect(sendReviewSummary).toHaveBeenCalledTimes(2);
    expect(sendReviewSummary).toHaveBeenCalledWith({
      tenantId: 'tenant-A',
      count: 2,
      lines: [
        { amount: 50000, createdAt: new Date('2026-10-19T09:10:00Z') },
        { amount: 50000, createdAt: new Date('2026-10-19T09:40:00Z') }
      ]
    });
    expect(contexts).toEqual(['tenant-A', 'tenant-B']);
    expect(report).toEqual({ tenants: 2, summariesSent: 2, failed: 0 });
    expect(purgeExpiredProofReads).toHaveBeenCalledWith(NOW);
  });

  it('ne dit rien d’une agence sans déclaration en attente (traitée entre-temps)', async () => {
    stubDeclarations({});
    const report = await runHourlyDeclarationBatch(NOW);
    expect(sendReviewSummary).not.toHaveBeenCalled();
    expect(report.summariesSent).toBe(0);
    expect(markers).toEqual([]);
  });

  it('un échec sur une agence n’empêche ni les autres ni la purge', async () => {
    stubDeclarations({ 'tenant-A': [{ at: '2026-10-19T09:10:00Z' }], 'tenant-B': [{ at: '2026-10-19T09:20:00Z' }] });
    sendReviewSummary.mockRejectedValueOnce(new Error('boum'));
    const report = await runHourlyDeclarationBatch(NOW);
    expect(report).toEqual({ tenants: 2, summariesSent: 1, failed: 1 });
    expect(purgeExpiredProofReads).toHaveBeenCalled();
  });

  it('une purge en échec ne fait pas échouer le passage', async () => {
    stubDeclarations({});
    purgeExpiredProofReads.mockRejectedValue(new Error('disque'));
    await expect(runHourlyDeclarationBatch(NOW)).resolves.toMatchObject({ failed: 0 });
  });
});

describe('anti-doublon entre instances (NotificationMarker)', () => {
  it('rejouer le même passage horaire n’envoie rien de plus', async () => {
    stubDeclarations({ 'tenant-A': [{ at: '2026-10-19T09:10:00Z' }], 'tenant-B': [{ at: '2026-10-19T09:20:00Z' }] });
    await runHourlyDeclarationBatch(NOW);
    expect(sendReviewSummary).toHaveBeenCalledTimes(2);
    expect(markers.map(m => m.entityId)).toEqual([
      'tenant-A|hour|2026-10-19T09:00:00.000Z',
      'tenant-B|hour|2026-10-19T09:00:00.000Z'
    ]);

    const replay = await runHourlyDeclarationBatch(new Date('2026-10-19T10:07:30Z'));
    expect(sendReviewSummary).toHaveBeenCalledTimes(2);
    expect(replay.summariesSent).toBe(0);
  });

  it('l’heure suivante est une autre fenêtre : un nouvel envoi part', async () => {
    stubDeclarations({ 'tenant-A': [{ at: '2026-10-19T09:10:00Z' }], 'tenant-B': [] });
    await runHourlyDeclarationBatch(NOW);
    await runHourlyDeclarationBatch(new Date('2026-10-19T11:02:00Z'));
    expect(sendReviewSummary).toHaveBeenCalledTimes(2);
  });

  it('un envoi qui n’a joint personne ne pose pas de marqueur et peut être retenté', async () => {
    stubDeclarations({ 'tenant-A': [{ at: '2026-10-19T09:10:00Z' }], 'tenant-B': [] });
    sendReviewSummary.mockResolvedValue(0);
    await runHourlyDeclarationBatch(NOW);
    expect(markers).toEqual([]);
    sendReviewSummary.mockResolvedValue(1);
    await runHourlyDeclarationBatch(NOW);
    expect(markers).toHaveLength(1);
  });
});

describe('alerte quotidienne de retard', () => {
  it('ne prévient que les agences dont une déclaration dépasse le seuil en jours ouvrés, et marque review_alerted_at', async () => {
    stubDeclarations({
      // Jeudi 15 → lundi 19 : 2 jours ouvrés seulement : pas en retard.
      'tenant-A': [{ at: '2026-10-15T09:00:00Z' }],
      // Lundi 12 → lundi 19 : 5 jours ouvrés : en retard ; la seconde est récente.
      'tenant-B': [
        { id: 'old', at: '2026-10-12T09:00:00Z', amount: 120000 },
        { id: 'new', at: '2026-10-19T08:00:00Z' }
      ]
    });
    const report = await runDailyOverdueAlert(NOW);

    expect(sendOverdueAlert).toHaveBeenCalledTimes(1);
    expect(sendOverdueAlert).toHaveBeenCalledWith({
      tenantId: 'tenant-B',
      count: 1,
      days: 3,
      lines: [{ amount: 120000, createdAt: new Date('2026-10-12T09:00:00Z') }]
    });
    expect(declarationUpdateMany).toHaveBeenCalledTimes(1);
    expect(declarationUpdateMany).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-B', id: { in: ['old'] }, review_alerted_at: null },
      data: { review_alerted_at: NOW }
    });
    expect(report).toEqual({ tenants: 2, summariesSent: 1, failed: 0 });
  });

  it('respecte le seuil propre à l’agence (reviewAlertBusinessDays)', async () => {
    stubDeclarations({ 'tenant-A': [{ at: '2026-10-15T09:00:00Z' }], 'tenant-B': [] });
    loadDeclaredPaymentSettings.mockResolvedValue({ reviewAlertBusinessDays: 1 });
    await runDailyOverdueAlert(NOW);
    expect(sendOverdueAlert).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-A', days: 1 }));
  });

  it('n’est envoyée qu’une fois par jour et par agence, puis reprend le lendemain', async () => {
    stubDeclarations({ 'tenant-A': [{ at: '2026-10-12T09:00:00Z' }], 'tenant-B': [] });
    await runDailyOverdueAlert(NOW);
    await runDailyOverdueAlert(new Date('2026-10-19T08:00:05Z'));
    expect(sendOverdueAlert).toHaveBeenCalledTimes(1);
    expect(markers[0].entityId).toBe('tenant-A|day|2026-10-19');
    await runDailyOverdueAlert(new Date('2026-10-20T08:00:00Z'));
    expect(sendOverdueAlert).toHaveBeenCalledTimes(2);
  });

  it('sans destinataire (0 envoi) : ni marqueur ni review_alerted_at', async () => {
    stubDeclarations({ 'tenant-A': [{ at: '2026-10-12T09:00:00Z' }], 'tenant-B': [] });
    sendOverdueAlert.mockResolvedValue(0);
    await runDailyOverdueAlert(NOW);
    expect(markers).toEqual([]);
    expect(declarationUpdateMany).not.toHaveBeenCalled();
  });

  it('un échec sur une agence n’arrête pas les autres', async () => {
    stubDeclarations({ 'tenant-A': [{ at: '2026-10-12T09:00:00Z' }], 'tenant-B': [{ at: '2026-10-12T09:00:00Z' }] });
    sendOverdueAlert.mockRejectedValueOnce(new Error('boum'));
    const report = await runDailyOverdueAlert(NOW);
    expect(report).toEqual({ tenants: 2, summariesSent: 1, failed: 1 });
  });
});

describe('purge des lectures IA expirées', () => {
  it('est appelée à chaque passage horaire avec l’horloge du passage', async () => {
    stubDeclarations({});
    purgeExpiredProofReads.mockResolvedValue(3);
    await runHourlyDeclarationBatch(NOW);
    expect(purgeExpiredProofReads).toHaveBeenCalledTimes(1);
    expect(purgeExpiredProofReads).toHaveBeenCalledWith(NOW);
  });
});

describe('planification', () => {
  it('programme l’horaire (UTC) et le quotidien de 8 h (Africa/Abidjan), une seule fois', () => {
    startRentalDeclaredPaymentJob();
    startRentalDeclaredPaymentJob();
    const calls = (cron.schedule as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe('0 * * * *');
    expect(calls[0][2]).toEqual({ timezone: 'UTC' });
    expect(calls[1][0]).toBe('0 8 * * *');
    expect(calls[1][2]).toEqual({ timezone: 'Africa/Abidjan' });
    stopRentalDeclaredPaymentJob();
  });
});
