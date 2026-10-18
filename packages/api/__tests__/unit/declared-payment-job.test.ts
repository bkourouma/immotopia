/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T043 : tâches horaire et quotidienne du paiement déclaré
 * (`jobs/syndic-declared-payment-job.ts`).
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
const syndicateFindFirst = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: {
    syndicPaymentDeclaration: { findMany: (...a: any[]) => declarationFindMany(...a) },
    syndicate: { findFirst: (...a: any[]) => syndicateFindFirst(...a) }
  }
}));

// Verrou consultatif + marqueur anti-doublon (idempotence entre instances) : verrou simulé, marqueurs en mémoire.
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
jest.mock('../../src/lib/syndics/declared-payment/notifications', () => ({
  sendReviewSummary: (...a: any[]) => sendReviewSummary(...a)
}));
const purgeExpiredProofReads = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/proof-files', () => ({
  purgeExpiredProofReads: (...a: any[]) => purgeExpiredProofReads(...a)
}));
const getDeclaredPaymentRules = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/settings', () => ({
  getDeclaredPaymentRules: (...a: any[]) => getDeclaredPaymentRules(...a)
}));

import * as cron from 'node-cron';
import {
  runDailyOverdueAlert,
  runHourlyDeclarationBatch,
  startOfHour,
  startSyndicDeclaredPaymentJob,
  stopSyndicDeclaredPaymentJob
} from '../../src/jobs/syndic-declared-payment-job';

// Lundi 19 octobre 2026, 10:07 UTC.
const NOW = new Date('2026-10-19T10:07:00Z');
const GROUPS = [
  { tenantId: 'tenant-A', syndicateId: 'syndic-1' },
  { tenantId: 'tenant-B', syndicateId: 'syndic-2' }
];

/** Réponses de `findMany` : d'abord les groupes, puis les `PENDING` de chaque copropriété. */
function stubDeclarations(pendingBySyndicate: Record<string, string[]>) {
  declarationFindMany.mockImplementation(async (args: any) => {
    if (args.distinct) return GROUPS;
    return (pendingBySyndicate[args.where.syndicateId] ?? []).map(createdAt => ({ createdAt: new Date(createdAt) }));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  contexts.length = 0;
  markers.length = 0;
  getDeclaredPaymentRules.mockResolvedValue({ reviewAlertBusinessDays: 3 });
  syndicateFindFirst.mockImplementation(async ({ where }: any) => ({ name: `Copro ${where.id}` }));
  sendReviewSummary.mockResolvedValue(2);
  purgeExpiredProofReads.mockResolvedValue(0);
});

describe('passage horaire', () => {
  it('startOfHour tronque à l’heure pleine UTC', () => {
    expect(startOfHour(NOW).toISOString()).toBe('2026-10-19T10:00:00.000Z');
  });

  it('regroupe : un récapitulatif par copropriété ayant reçu une déclaration pendant l’heure pleine précédente', async () => {
    stubDeclarations({
      'syndic-1': ['2026-10-19T09:10:00Z', '2026-10-19T09:40:00Z'],
      'syndic-2': ['2026-10-19T09:59:00Z']
    });
    const report = await runHourlyDeclarationBatch(NOW);

    const groupsQuery = declarationFindMany.mock.calls.find(([args]) => args.distinct)![0];
    expect(groupsQuery.where.status).toBe('PENDING');
    expect(groupsQuery.where.createdAt.gte.toISOString()).toBe('2026-10-19T09:00:00.000Z');
    expect(groupsQuery.where.createdAt.lt.toISOString()).toBe('2026-10-19T10:00:00.000Z');

    expect(sendReviewSummary).toHaveBeenCalledTimes(2);
    expect(sendReviewSummary).toHaveBeenCalledWith({
      tenantId: 'tenant-A',
      syndicateId: 'syndic-1',
      syndicName: 'Copro syndic-1',
      pendingCount: 2,
      overdueCount: 0
    });
    expect(contexts).toEqual(['tenant-A', 'tenant-B']);
    expect(report).toEqual({ syndicates: 2, summariesSent: 2, failed: 0 });
    expect(purgeExpiredProofReads).toHaveBeenCalledWith(NOW);
  });

  it('ne dit rien d’une copropriété sans déclaration en attente (traitée entre-temps)', async () => {
    stubDeclarations({});
    const report = await runHourlyDeclarationBatch(NOW);
    expect(sendReviewSummary).not.toHaveBeenCalled();
    expect(report.summariesSent).toBe(0);
  });

  it('un échec sur une agence n’empêche ni les autres ni la purge', async () => {
    stubDeclarations({ 'syndic-1': ['2026-10-19T09:10:00Z'], 'syndic-2': ['2026-10-19T09:20:00Z'] });
    sendReviewSummary.mockRejectedValueOnce(new Error('boum'));
    const report = await runHourlyDeclarationBatch(NOW);
    expect(report).toEqual({ syndicates: 2, summariesSent: 1, failed: 1 });
    expect(purgeExpiredProofReads).toHaveBeenCalled();
  });

  it('une purge en échec ne fait pas échouer le passage', async () => {
    stubDeclarations({});
    purgeExpiredProofReads.mockRejectedValue(new Error('disque'));
    await expect(runHourlyDeclarationBatch(NOW)).resolves.toMatchObject({ failed: 0 });
  });
});

describe('idempotence entre instances', () => {
  it('rejouer le même passage horaire (deuxième instance) n’envoie rien de plus', async () => {
    stubDeclarations({ 'syndic-1': ['2026-10-19T09:10:00Z'], 'syndic-2': ['2026-10-19T09:20:00Z'] });
    await runHourlyDeclarationBatch(NOW);
    expect(sendReviewSummary).toHaveBeenCalledTimes(2);
    expect(markers.map(m => m.entityId)).toEqual([
      'syndic-1|hour|2026-10-19T09:00:00.000Z',
      'syndic-2|hour|2026-10-19T09:00:00.000Z'
    ]);

    const replay = await runHourlyDeclarationBatch(new Date('2026-10-19T10:07:30Z'));
    expect(sendReviewSummary).toHaveBeenCalledTimes(2);
    expect(replay.summariesSent).toBe(0);
  });

  it('l’heure suivante est une autre fenêtre : un nouvel envoi part', async () => {
    stubDeclarations({ 'syndic-1': ['2026-10-19T09:10:00Z'], 'syndic-2': [] });
    await runHourlyDeclarationBatch(NOW);
    await runHourlyDeclarationBatch(new Date('2026-10-19T11:02:00Z'));
    expect(sendReviewSummary).toHaveBeenCalledTimes(2);
  });

  it('un envoi qui n’a joint personne ne pose pas de marqueur et peut être retenté', async () => {
    stubDeclarations({ 'syndic-1': ['2026-10-19T09:10:00Z'], 'syndic-2': [] });
    sendReviewSummary.mockResolvedValue(0);
    await runHourlyDeclarationBatch(NOW);
    expect(markers).toEqual([]);
    sendReviewSummary.mockResolvedValue(1);
    await runHourlyDeclarationBatch(NOW);
    expect(markers).toHaveLength(1);
  });

  it('l’alerte quotidienne n’est envoyée qu’une fois par jour et par copropriété', async () => {
    stubDeclarations({ 'syndic-1': ['2026-10-12T09:00:00Z'], 'syndic-2': [] });
    await runDailyOverdueAlert(NOW);
    await runDailyOverdueAlert(new Date('2026-10-19T08:00:05Z'));
    expect(sendReviewSummary).toHaveBeenCalledTimes(1);
    expect(markers[0].entityId).toBe('syndic-1|day|2026-10-19');
    await runDailyOverdueAlert(new Date('2026-10-20T08:00:00Z'));
    expect(sendReviewSummary).toHaveBeenCalledTimes(2);
  });
});

describe('alerte quotidienne', () => {
  it('ne prévient que les copropriétés dont une déclaration dépasse son délai en jours ouvrés', async () => {
    stubDeclarations({
      // Jeudi 15 → lundi 19 : 2 jours ouvrés seulement (vendredi, lundi) : pas en retard.
      'syndic-1': ['2026-10-15T09:00:00Z'],
      // Lundi 12 → lundi 19 : 5 jours ouvrés : en retard.
      'syndic-2': ['2026-10-12T09:00:00Z', '2026-10-19T08:00:00Z']
    });
    const report = await runDailyOverdueAlert(NOW);
    expect(sendReviewSummary).toHaveBeenCalledTimes(1);
    expect(sendReviewSummary).toHaveBeenCalledWith(
      expect.objectContaining({ syndicateId: 'syndic-2', pendingCount: 2, overdueCount: 1 })
    );
    expect(report.summariesSent).toBe(1);
    expect(purgeExpiredProofReads).not.toHaveBeenCalled();
  });

  it('utilise le délai propre à chaque copropriété', async () => {
    stubDeclarations({ 'syndic-1': ['2026-10-15T09:00:00Z'], 'syndic-2': [] });
    getDeclaredPaymentRules.mockResolvedValueOnce({ reviewAlertBusinessDays: 1 });
    await runDailyOverdueAlert(NOW);
    expect(sendReviewSummary).toHaveBeenCalledWith(
      expect.objectContaining({ syndicateId: 'syndic-1', overdueCount: 1 })
    );
  });
});

describe('planification', () => {
  it('programme l’heure pleine (UTC) et 8 h Africa/Abidjan, et refuse un double démarrage', () => {
    startSyndicDeclaredPaymentJob();
    const calls = (cron.schedule as jest.Mock).mock.calls;
    expect(calls.map(([expression, , options]) => [expression, options.timezone])).toEqual([
      ['0 * * * *', 'UTC'],
      ['0 8 * * *', 'Africa/Abidjan']
    ]);
    startSyndicDeclaredPaymentJob();
    expect(cron.schedule).toHaveBeenCalledTimes(2);
    stopSyndicDeclaredPaymentJob();
  });
});
