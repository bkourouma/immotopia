/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot S4 — programmations d'appels de charges automatiques, sur une base en
 * mémoire qui applique vraiment les filtres `where`
 * (`__tests__/helpers/fake-prisma.ts`).
 *
 * Jeu de données :
 *   Agence A — copropriété S1 : lots L1 (Awa, 600 tantièmes), L2 (Bakary,
 *              400), parking P1 (sans copropriétaire) ; budget BUD1 approuvé
 *              2026 (L1 12 000, L2 8 000,05) ; moyen de paiement Orange Money.
 *            — copropriété S2 : lot L3 (Awa) ; budget BUD2 en brouillon.
 *   Agence B — copropriété SB : lot LB ; budget BUDB approuvé.
 */

import { PDFDocument } from 'pdf-lib';
import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const mockSendEmail = jest.fn(async (_params: any) => undefined);
const mockIsEmailDeliveryConfigured = jest.fn(() => true);
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (params: any) => mockSendEmail(params) },
  isEmailDeliveryConfigured: () => mockIsEmailDeliveryConfigured()
}));
const mockGetEmailNotificationConfig = jest.fn(async (..._args: any[]) => ({
  enabled: true,
  subjectOverride: null,
  bodyHtmlOverride: null
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...args: any[]) => mockGetEmailNotificationConfig(...args)
}));
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: jest.fn(async () => false)
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), flushAuditQueue: jest.fn() }));

// Droits d'abonnement de l'agence (tâche quotidienne) : SYNDIC complet par défaut.
const fullEntitlements = () => ({ enforcement: 'enforce', moduleAccess: { MODULE_SYNDIC: 'FULL' }, readOnly: false });
const mockGetEntitlements = jest.fn(async (_tenantId: string, _options?: any): Promise<any> => fullEntitlements());
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: (tenantId: string, options?: any) => mockGetEntitlements(tenantId, options)
}));

import { recordLotPayment } from '../../src/lib/syndics/charge-allocation';
import { generateChargeCallsFromBudget } from '../../src/lib/syndics/queries';
import {
  createChargeSchedule,
  deleteChargeSchedule,
  executeChargeScheduleNow,
  getChargeSchedule,
  listChargeScheduleRuns,
  listChargeSchedules,
  pauseChargeSchedule,
  previewChargeSchedule,
  resendChargeScheduleRunNotices,
  resumeChargeSchedule,
  updateChargeSchedule
} from '../../src/lib/syndics/charge-schedules';
import {
  isPeriodReservationConflict,
  MAX_CATCH_UP_PERIODS,
  runDueChargeSchedules,
  TECHNICAL_ERROR_MESSAGE
} from '../../src/lib/syndics/charge-schedule-runner';
import * as noticePdf from '../../src/lib/syndics/charge-call-notice-pdf';
import * as documentBranding from '../../src/lib/documents/document-branding';
import {
  getChargeCallNoticeForCoOwner,
  getChargeCallNoticeForTenant,
  toNoticeData
} from '../../src/lib/syndics/charge-call-notice';
import type { CreateChargeScheduleInput } from '../../src/lib/syndics/charge-schedule-schemas';
import type { CoOwnerPortalScope } from '../../src/lib/syndics/coowner-portal';
import { runSyndicChargeCallScheduler } from '../../src/jobs/syndic-charge-call-scheduler.job';
import { logger } from '../../src/utils/logger';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const S1 = id(1);
const S2 = id(2);
const SB = id(3);
const L1 = id(11);
const L2 = id(12);
const P1 = id(13);
const L3 = id(14);
const LB = id(15);
const BUD1 = id(21);
const BUD2 = id(22);
const BUDB = id(23);
const AWA = 'contact-awa';
const BAKARY = 'contact-bakary';
const d = (value: string) => new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
const NOW = d('2026-09-27T09:00:00.000Z');

const syndicates: Record<string, { tenantId: string; name: string }> = {
  [S1]: { tenantId: TENANT_A, name: 'Residence Les Palmiers' },
  [S2]: { tenantId: TENANT_A, name: 'Residence Les Cocotiers' },
  [SB]: { tenantId: TENANT_B, name: 'Residence B' }
};

const contacts: Record<string, any> = {
  [AWA]: {
    id: AWA,
    tenantId: TENANT_A,
    firstName: 'Awa',
    lastName: 'Kone',
    legalName: null,
    email: 'awa@example.test',
    address: 'Cocody'
  },
  [BAKARY]: {
    id: BAKARY,
    tenantId: TENANT_A,
    firstName: 'Bakary',
    lastName: 'Traore',
    legalName: null,
    email: 'bakary@example.test',
    address: null
  }
};

function lotRow(lotId: string, syndicateId: string, lotNumber: string, lotType: string, shares: number, owner: any) {
  return {
    id: lotId,
    syndicateId,
    lotNumber,
    lotType,
    generalShares: shares,
    specialShares: null,
    ownerContactId: owner?.id ?? null,
    owner,
    coowner: null,
    syndicate: { tenantId: syndicates[syndicateId].tenantId }
  };
}

function budgetRow(budgetId: string, syndicateId: string, status: string, allocations: Array<[string, number]>) {
  return {
    id: budgetId,
    syndicateId,
    fiscalYear: 2026,
    label: `Budget 2026 ${syndicateId.slice(-2)}`,
    status,
    approvedAt: status === 'APPROVED' ? d('2026-01-15') : null,
    totalAmount: allocations.reduce((sum, [, amount]) => sum + amount, 0),
    currency: 'XOF',
    createdAt: d('2026-01-01'),
    allocations: allocations.map(([lotId, totalAllocated]) => ({ budgetId, lotId, totalAllocated }))
  };
}

// Relations dont les lectures ont besoin, posées sur la ligne à la création.
const originalCallCreate = mockPrisma.chargeCall.create.getMockImplementation()!;
mockPrisma.chargeCall.create.mockImplementation(async (args: any) => {
  const result = await originalCallCreate(args);
  const row = mockPrisma.chargeCall.rows[mockPrisma.chargeCall.rows.length - 1];
  row.status = row.status ?? 'PENDING';
  row.syndicate = { tenantId: syndicates[row.syndicateId].tenantId, name: syndicates[row.syndicateId].name };
  row.lot = mockPrisma.syndicateLot.rows.find(lot => lot.id === row.lotId);
  Object.defineProperty(row, 'allocations', {
    enumerable: true,
    get: () => mockPrisma.chargePaymentAllocation.rows.filter(allocation => allocation.chargeCallId === row.id)
  });
  return result;
});

// Unicité (programmation, début de période) du journal des exécutions, comme en base.
const originalRunCreate = mockPrisma.syndicChargeScheduleRun.create.getMockImplementation()!;
mockPrisma.syndicChargeScheduleRun.create.mockImplementation(async (args: any) => {
  const clash = mockPrisma.syndicChargeScheduleRun.rows.some(
    row =>
      row.scheduleId === args.data.scheduleId && new Date(row.periodStart).getTime() === args.data.periodStart.getTime()
  );
  if (clash) {
    throw Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['schedule_id', 'period_start'] }
    });
  }
  return originalRunCreate(args);
});

function seed() {
  mockPrisma.reset();
  mockSendEmail.mockReset();
  mockSendEmail.mockImplementation(async () => undefined);
  mockIsEmailDeliveryConfigured.mockReset();
  mockIsEmailDeliveryConfigured.mockImplementation(() => true);
  mockGetEmailNotificationConfig.mockReset();
  mockGetEmailNotificationConfig.mockImplementation(async () => ({
    enabled: true,
    subjectOverride: null,
    bodyHtmlOverride: null
  }));
  mockGetEntitlements.mockReset();
  mockGetEntitlements.mockImplementation(async () => fullEntitlements());
  for (const [syndicId, info] of Object.entries(syndicates)) {
    mockPrisma.syndicate.rows.push({
      id: syndicId,
      tenantId: info.tenantId,
      name: info.name,
      address: 'Abidjan',
      registrationNo: null,
      cadastralReference: null,
      status: 'ACTIVE',
      mandatingAgencyId: null,
      mandatingAgency: null
    });
  }
  mockPrisma.tenant.rows.push(
    { id: TENANT_A, name: 'Agence A', status: 'ACTIVE' },
    { id: TENANT_B, name: 'Agence B', status: 'ACTIVE' }
  );
  mockPrisma.crmContact.rows.push(...Object.values(contacts).map(contact => ({ ...contact })));
  mockPrisma.syndicateLot.rows.push(
    lotRow(L1, S1, 'A-01', 'APARTMENT', 600, contacts[AWA]),
    lotRow(L2, S1, 'A-02', 'APARTMENT', 400, contacts[BAKARY]),
    lotRow(P1, S1, 'P-01', 'PARKING', 50, null),
    lotRow(L3, S2, 'C-01', 'APARTMENT', 1000, contacts[AWA]),
    lotRow(LB, SB, 'B-01', 'APARTMENT', 1000, null)
  );
  mockPrisma.syndicateBudget.rows.push(
    budgetRow(BUD1, S1, 'APPROVED', [
      [L1, 12000],
      [L2, 8000.05]
    ]),
    budgetRow(BUD2, S2, 'DRAFT', [[L3, 6000]]),
    budgetRow(BUDB, SB, 'APPROVED', [[LB, 6000]])
  );
  mockPrisma.syndicPaymentMethod.rows.push({
    id: id(31),
    syndicateId: S1,
    type: 'MOBILE_MONEY',
    label: 'Orange Money',
    provider: 'Orange',
    accountRef: '+225 07 00 00 00',
    isActive: true,
    isDefault: true,
    createdAt: d('2026-01-01')
  });
}

beforeEach(seed);

function input(overrides: Partial<CreateChargeScheduleInput> = {}): CreateChargeScheduleInput {
  return {
    label: 'Charges courantes',
    frequency: 'MONTHLY',
    issueDay: 1,
    dueOffsetDays: 15,
    amountSource: 'BUDGET',
    budgetId: BUD1,
    startDate: d('2026-01-01'),
    ...overrides
  };
}

const calls = () => mockPrisma.chargeCall.rows;
const batches = () => mockPrisma.chargeCallBatch.rows;
const runs = () => mockPrisma.syndicChargeScheduleRun.rows;
const amountsByLot = (rows: any[]) => Object.fromEntries(rows.map(row => [row.lotId, Number(row.amount)]));
const scheduleRow = (scheduleId: string) => mockPrisma.syndicChargeSchedule.rows.find(row => row.id === scheduleId)!;

function pay(lotId: string, amount: number) {
  return recordLotPayment({
    tenantId: TENANT_A,
    syndicateId: S1,
    lotId,
    amount,
    paidAt: d('2026-09-01'),
    method: 'VIREMENT',
    reference: 'VIR-1',
    actorUserId: 'user-1'
  });
}

// ---------------------------------------------------------------------------

describe('creation et prochaine emission', () => {
  it('prochaine emission = premiere date d emission a partir d aujourd hui', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), 'user-1', NOW);
    expect(schedule).toMatchObject({
      syndicateId: S1,
      frequency: 'MONTHLY',
      amountSource: 'BUDGET',
      budgetId: BUD1,
      startDate: '2026-01-01',
      endDate: null,
      active: true,
      hasIssuedPeriods: false,
      lastRun: null
    });
    expect(schedule.nextRunAt).toEqual(d('2026-10-01'));
    expect(schedule.nextPeriod).toEqual({
      label: 'Octobre 2026',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      issueDate: '2026-10-01',
      dueDate: '2026-10-16'
    });
    expect(scheduleRow(schedule.id)).toMatchObject({ tenantId: TENANT_A, createdById: 'user-1' });
    expect(await listChargeSchedules(TENANT_A, S1)).toHaveLength(1);
  });

  it('isolation : copropriete ou budget d une autre copropriete / agence -> 404', async () => {
    await expect(createChargeSchedule(TENANT_A, SB, input(), null, NOW)).rejects.toMatchObject({ statusCode: 404 });
    await expect(createChargeSchedule(TENANT_A, S1, input({ budgetId: BUDB }), null, NOW)).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(createChargeSchedule(TENANT_A, S1, input({ budgetId: BUD2 }), null, NOW)).rejects.toMatchObject({
      statusCode: 404
    });

    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    await expect(getChargeSchedule(TENANT_B, S1, schedule.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getChargeSchedule(TENANT_A, S2, schedule.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(executeChargeScheduleNow(TENANT_A, S2, schedule.id, NOW)).rejects.toMatchObject({ statusCode: 404 });
    await expect(updateChargeSchedule(TENANT_A, S1, schedule.id, { budgetId: BUDB }, NOW)).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(deleteChargeSchedule(TENANT_B, SB, schedule.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(await listChargeSchedules(TENANT_A, S2)).toEqual([]);
  });
});

describe('execution et idempotence', () => {
  it('executer : periode en cours, budget / 12 ; deux executions -> un seul lot d appels', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const first = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(first.run).toMatchObject({
      status: 'SUCCESS',
      alreadyProcessed: false,
      periodStart: '2026-09-01',
      periodLabel: 'Septembre 2026',
      callsCreated: 2,
      callsCovered: 0,
      notificationsSent: 2
    });
    expect(batches()).toHaveLength(1);
    expect(batches()[0]).toMatchObject({
      syndicateId: S1,
      label: 'Charges courantes - Septembre 2026',
      period: 'Septembre 2026',
      budgetId: BUD1,
      batchType: 'REGULAR'
    });
    expect(Number(batches()[0].totalAmount)).toBe(1666.67);
    // Parking hors budget ; septembre n'est pas la derniere periode : 8000,05 / 12 arrondi au centime inferieur.
    expect(amountsByLot(calls())).toEqual({ [L1]: 1000, [L2]: 666.67 });
    expect(calls()[0]).toMatchObject({
      periodStart: d('2026-09-01'),
      periodEnd: d('2026-09-30'),
      dueDate: d('2026-09-16')
    });

    const second = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(second.run).toMatchObject({ status: 'SKIPPED', alreadyProcessed: true, callsCreated: 0 });
    expect(batches()).toHaveLength(1);
    expect(calls()).toHaveLength(2);
    expect(runs()).toHaveLength(1);
    // Septembre n'etait pas la prochaine periode prevue : la programmation n'avance pas.
    expect(second.schedule.nextRunAt).toEqual(d('2026-10-01'));
    expect(second.schedule.hasIssuedPeriods).toBe(true);
  });

  it('course : la reservation de la periode bute sur l unicite -> SKIPPED, rien de cree', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    // Une seconde execution qui n'a pas vu la premiere (lecture prealable manquee).
    mockPrisma.syndicChargeScheduleRun.findFirst.mockImplementationOnce(async () => null);
    const raced = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(raced.run).toMatchObject({ status: 'SKIPPED', alreadyProcessed: true });
    expect(batches()).toHaveLength(1);
    expect(calls()).toHaveLength(2);
  });

  it('tache quotidienne : periode due, derniere periode de l annee absorbant l arrondi, puis avance', async () => {
    const schedule = await createChargeSchedule(
      TENANT_A,
      S1,
      input({ frequency: 'QUARTERLY', startDate: d('2026-10-01'), dueOffsetDays: 30 }),
      null,
      NOW
    );
    expect(schedule.nextRunAt).toEqual(d('2026-10-01'));

    expect((await runDueChargeSchedules(d('2026-09-30T06:00:00.000Z'))).schedules).toBe(0);
    const report = await runSyndicChargeCallScheduler(d('2026-10-01T06:00:00.000Z'));
    expect(report).toMatchObject({ schedules: 1, success: 1, skipped: 0, failed: 0 });
    expect(amountsByLot(calls())).toEqual({ [L1]: 3000, [L2]: 2000.02 });
    expect(calls()[0]).toMatchObject({ period: 'T4 2026', dueDate: d('2026-10-31') });
    expect(scheduleRow(schedule.id).nextRunAt).toEqual(d('2027-01-01'));
    expect(scheduleRow(schedule.id).lastRunAt).toEqual(d('2026-10-01T06:00:00.000Z'));

    // Relancee le meme jour : rien n'est du.
    expect((await runDueChargeSchedules(d('2026-10-01T07:00:00.000Z'))).schedules).toBe(0);
    expect(batches()).toHaveLength(1);
    expect(runs().map(run => [run.status, run.trigger])).toEqual([['SUCCESS', 'CRON']]);
  });

  it('montant fixe : reparti par tantiemes entre les lots principaux', async () => {
    const schedule = await createChargeSchedule(
      TENANT_A,
      S1,
      input({ amountSource: 'FIXED', budgetId: null, fixedAmount: 1000 }),
      null,
      NOW
    );
    await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(amountsByLot(calls())).toEqual({ [L1]: 600, [L2]: 400 });
    expect(batches()[0].budgetId).toBeUndefined();
  });

  it('sans budget designe : budget approuve de l exercice de la periode', async () => {
    const schedule = await createChargeSchedule(
      TENANT_A,
      S1,
      input({ budgetId: null, endDate: d('2026-12-31') }),
      null,
      NOW
    );
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run.status).toBe('SUCCESS');
    expect(batches()[0].budgetId).toBe(BUD1);

    // Janvier 2027 : aucun budget 2027 approuve -> echec explicite.
    const next = await createChargeSchedule(
      TENANT_A,
      S1,
      input({ budgetId: null, startDate: d('2027-01-01') }),
      null,
      NOW
    );
    const failed = await runDueChargeSchedules(d('2027-01-01T06:00:00.000Z'));
    expect(failed.failures.map(failure => failure.scheduleId)).toContain(next.id);
    expect(failed.failures.find(failure => failure.scheduleId === next.id)?.error).toBe(
      "Aucun budget approuvé pour l'exercice 2027 : aucun appel émis."
    );
  });
});

describe('avance : un appel couvert n est pas notifie', () => {
  it('quittance pour le lot couvert, avis d appel PDF joint aux seuls appels non couverts', async () => {
    await pay(L2, 1000);
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);

    expect(result.run).toMatchObject({ status: 'SUCCESS', callsCreated: 2, callsCovered: 1, notificationsSent: 1 });
    const l2Call = calls().find(call => call.lotId === L2)!;
    expect(l2Call.status).toBe('PAID');
    expect(
      mockPrisma.syndicChargeReceipt.rows.filter(row => row.kind === 'QUITTANCE').map(row => row.chargeCallId)
    ).toEqual([l2Call.id]);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const mail = mockSendEmail.mock.calls[0][0];
    expect(mail.to).toBe('awa@example.test');
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0]).toMatchObject({
      filename: "Avis d'appel A-01 Septembre 2026.pdf",
      contentType: 'application/pdf'
    });
    const pdf = await PDFDocument.load(mail.attachments[0].content);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Avis d'appel de charges A-01 Septembre 2026");

    const history = await listChargeScheduleRuns(TENANT_A, S1, schedule.id, { limit: 50 });
    expect(history).toEqual([
      expect.objectContaining({
        status: 'SUCCESS',
        callsCreated: 2,
        callsCovered: 1,
        notificationsSent: 1,
        trigger: 'MANUAL'
      })
    ]);
  });

  it('avance partielle : l avis montre l avance imputee et le reste a payer', async () => {
    await pay(L1, 400);
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    const l1Call = calls().find(call => call.lotId === L1)!;
    const data = toNoticeData(l1Call as any, []);
    expect(data).toMatchObject({ amount: 1000, advanceImputed: 400, paid: 0, outstanding: 600 });
    expect(data.coowner).toEqual({ name: 'Awa Kone', address: 'Cocody' });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });
});

describe('echecs et rattrapage', () => {
  it('l echec d une copropriete n arrete pas les autres ; retente une fois le budget approuve', async () => {
    const failing = await createChargeSchedule(
      TENANT_A,
      S2,
      input({ budgetId: BUD2, startDate: d('2026-10-01') }),
      null,
      NOW
    );
    const ok = await createChargeSchedule(TENANT_A, S1, input({ startDate: d('2026-10-01') }), null, NOW);
    // Une troisieme programmation plante franchement (lecture impossible).
    const crashing = await createChargeSchedule(
      TENANT_B,
      SB,
      input({ budgetId: BUDB, startDate: d('2026-10-01') }),
      null,
      NOW
    );
    const originalFind = mockPrisma.syndicChargeSchedule.findFirst.getMockImplementation()!;
    mockPrisma.syndicChargeSchedule.findFirst.mockImplementation(async (args: any) => {
      if (args?.where?.id === crashing.id) throw new Error('connexion perdue');
      return originalFind(args);
    });

    const report = await runDueChargeSchedules(d('2026-10-01T06:00:00.000Z'));
    mockPrisma.syndicChargeSchedule.findFirst.mockImplementation(originalFind);
    expect(report).toMatchObject({ schedules: 3, success: 1, failed: 2 });
    expect(report.failures).toEqual(
      expect.arrayContaining([
        {
          tenantId: TENANT_A,
          syndicateId: S2,
          scheduleId: failing.id,
          error: expect.stringContaining("n'est pas approuvé")
        },
        { tenantId: TENANT_B, syndicateId: SB, scheduleId: crashing.id, error: 'connexion perdue' }
      ])
    );
    expect(calls().every(call => call.syndicateId === S1)).toBe(true);
    expect(scheduleRow(ok.id).nextRunAt).toEqual(d('2026-11-01'));
    // Programmation en echec : toujours active, periode non avancee, echec consigne.
    expect(scheduleRow(failing.id)).toMatchObject({ active: true, nextRunAt: d('2026-10-01') });
    expect(
      runs()
        .filter(run => run.scheduleId === failing.id)
        .map(run => run.status)
    ).toEqual(['FAILED']);

    // Le lendemain, budget approuve : la periode passe, l'echec est remplace.
    mockPrisma.syndicateBudget.rows.find(row => row.id === BUD2)!.status = 'APPROVED';
    const retry = await runDueChargeSchedules(d('2026-10-02T06:00:00.000Z'));
    // S2 retentee, SB (qui avait plante) aussi ; S1, deja avancee, n'est plus due.
    expect(retry).toMatchObject({ schedules: 2, success: 2, failed: 0 });
    expect(
      runs()
        .filter(run => run.scheduleId === failing.id)
        .map(run => run.status)
    ).toEqual(['SUCCESS']);
    expect(scheduleRow(failing.id).nextRunAt).toEqual(d('2026-11-01'));
  });

  it('rattrapage des periodes manquees, dans l ordre', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    scheduleRow(schedule.id).nextRunAt = d('2026-06-01'); // serveur arrete depuis juin
    const report = await runDueChargeSchedules(NOW);
    expect(report.success).toBe(4);
    expect(batches().map(batch => batch.period)).toEqual(['Juin 2026', 'Juillet 2026', 'Août 2026', 'Septembre 2026']);
    expect(scheduleRow(schedule.id).nextRunAt).toEqual(d('2026-10-01'));
  });

  it('rattrapage borne a 12 periodes par passage', async () => {
    const schedule = await createChargeSchedule(
      TENANT_A,
      S1,
      input({ amountSource: 'FIXED', budgetId: null, fixedAmount: 100, startDate: d('2025-01-01') }),
      null,
      NOW
    );
    scheduleRow(schedule.id).nextRunAt = d('2025-01-01');
    const report = await runDueChargeSchedules(NOW);
    expect(report.success).toBe(MAX_CATCH_UP_PERIODS);
    expect(batches()).toHaveLength(12);
    expect(scheduleRow(schedule.id).nextRunAt).toEqual(d('2026-01-01'));
  });

  it('date de fin depassee : plus de prochaine emission', async () => {
    const schedule = await createChargeSchedule(
      TENANT_A,
      S1,
      input({ frequency: 'QUARTERLY', startDate: d('2026-01-01'), endDate: d('2026-12-31') }),
      null,
      NOW
    );
    expect(schedule.nextRunAt).toEqual(d('2026-10-01'));
    await runDueChargeSchedules(d('2026-10-01T06:00:00.000Z'));
    expect(scheduleRow(schedule.id).nextRunAt).toBeNull();
  });
});

describe('gestion des programmations', () => {
  it('pause, execution refusee, reprise', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input({ issueDay: 5 }), null, NOW);
    expect((await pauseChargeSchedule(TENANT_A, S1, schedule.id)).active).toBe(false);
    await expect(executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW)).rejects.toMatchObject({ statusCode: 409 });
    expect((await runDueChargeSchedules(d('2026-10-05T06:00:00.000Z'))).schedules).toBe(0);
    // Reprise en novembre : octobre (emis pendant la pause) n'est pas rattrape.
    const resumed = await resumeChargeSchedule(TENANT_A, S1, schedule.id, d('2026-11-03'));
    expect(resumed).toMatchObject({ active: true, nextRunAt: d('2026-11-05') });
  });

  it('modification : jour d emission recalcule ; frequence figee apres une emission', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const updated = await updateChargeSchedule(TENANT_A, S1, schedule.id, { issueDay: 28 }, NOW);
    expect(updated.nextRunAt).toEqual(d('2026-09-28'));
    await expect(updateChargeSchedule(TENANT_A, S1, schedule.id, { amountSource: 'FIXED' }, NOW)).rejects.toMatchObject(
      { statusCode: 422 }
    );
    const fixed = await updateChargeSchedule(
      TENANT_A,
      S1,
      schedule.id,
      { amountSource: 'FIXED', fixedAmount: 500 },
      NOW
    );
    expect(fixed).toMatchObject({ amountSource: 'FIXED', fixedAmount: 500, budgetId: null });

    await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    await expect(
      updateChargeSchedule(TENANT_A, S1, schedule.id, { frequency: 'QUARTERLY' }, NOW)
    ).rejects.toMatchObject({ statusCode: 409 });
    expect((await updateChargeSchedule(TENANT_A, S1, schedule.id, { label: 'Nouveau libelle' }, NOW)).label).toBe(
      'Nouveau libelle'
    );
  });

  it('suppression sans emission ; desactivation apres une emission', async () => {
    const empty = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    expect(await deleteChargeSchedule(TENANT_A, S1, empty.id)).toEqual({
      deleted: true,
      deactivated: false,
      schedule: null
    });
    expect(mockPrisma.syndicChargeSchedule.rows).toHaveLength(0);

    const used = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    await executeChargeScheduleNow(TENANT_A, S1, used.id, NOW);
    const result = await deleteChargeSchedule(TENANT_A, S1, used.id);
    expect(result).toMatchObject({ deleted: false, deactivated: true, schedule: { id: used.id, active: false } });
    expect(runs()).toHaveLength(1);
  });

  it('apercu : 3 prochaines periodes avec montants ; budget non approuve -> erreur lisible', async () => {
    const schedule = await createChargeSchedule(
      TENANT_A,
      S1,
      input({ frequency: 'QUARTERLY', dueOffsetDays: 10 }),
      null,
      NOW
    );
    const preview = await previewChargeSchedule(TENANT_A, S1, schedule.id, NOW);
    expect(preview.periods.map(period => [period.label, period.issueDate, period.dueDate, period.totalAmount])).toEqual(
      [
        ['T4 2026', '2026-10-01', '2026-10-11', 5000.02],
        // Budget designe : reconduit tant qu'on ne le change pas (T1 : 2000,01 pour L2, sans l'arrondi de fin d'annee).
        ['T1 2027', '2027-01-01', '2027-01-11', 5000.01],
        ['T2 2027', '2027-04-01', '2027-04-11', 5000.01]
      ]
    );
    expect(preview.periods[0].lots).toEqual([
      { lotId: L1, lotNumber: 'A-01', amount: 3000 },
      { lotId: L2, lotNumber: 'A-02', amount: 2000.02 }
    ]);
    expect(mockPrisma.chargeCall.rows).toHaveLength(0);

    const draft = await createChargeSchedule(TENANT_A, S2, input({ budgetId: BUD2 }), null, NOW);
    const draftPreview = await previewChargeSchedule(TENANT_A, S2, draft.id, NOW);
    expect(draftPreview.periods[0]).toMatchObject({ totalAmount: null, lots: [] });
    expect(draftPreview.periods[0].error).toContain("n'est pas approuvé");
  });
});

describe('avis d appel PDF : gestion et portail', () => {
  let callL1: any;
  let callL2: any;
  beforeEach(async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    callL1 = calls().find(call => call.lotId === L1);
    callL2 = calls().find(call => call.lotId === L2);
  });

  it('gestion : avis de l appel de la copropriete de l agence, 404 ailleurs', async () => {
    const file = await getChargeCallNoticeForTenant(TENANT_A, S1, callL1.id);
    expect(file.mimeType).toBe('application/pdf');
    expect(file.fileName).toBe("Avis d'appel A-01 Septembre 2026.pdf");
    expect(file.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    await expect(getChargeCallNoticeForTenant(TENANT_B, S1, callL1.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getChargeCallNoticeForTenant(TENANT_A, S2, callL1.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('portail : seul un appel d un lot du perimetre ; sinon 404', async () => {
    const scope: CoOwnerPortalScope = {
      tenantId: TENANT_A,
      contactIds: [AWA],
      lots: [{ lotId: L1, syndicateId: S1, contactId: AWA, ownershipPercentage: 100, ownedSince: d('2026-01-01') }],
      lotIds: [L1],
      syndicateIds: [S1]
    };
    const file = await getChargeCallNoticeForCoOwner(scope, callL1.id);
    expect(file.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    await expect(getChargeCallNoticeForCoOwner(scope, callL2.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      getChargeCallNoticeForCoOwner({ ...scope, tenantId: TENANT_B, lots: [], lotIds: [], syndicateIds: [] }, callL1.id)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('portail : un appel anterieur a l acquisition du lot (ownedSince) repond 404, un appel posterieur sert le PDF', async () => {
    expect(callL1.periodStart).toEqual(d('2026-09-01'));
    const scopeSince = (ownedSince: Date): CoOwnerPortalScope => ({
      tenantId: TENANT_A,
      contactIds: [AWA],
      lots: [{ lotId: L1, syndicateId: S1, contactId: AWA, ownershipPercentage: 100, ownedSince }],
      lotIds: [L1],
      syndicateIds: [S1]
    });
    // Nouveau proprietaire depuis le 15/09 : l'appel de septembre est celui de l'ancien proprietaire.
    await expect(getChargeCallNoticeForCoOwner(scopeSince(d('2026-09-15')), callL1.id)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Appel de charges introuvable.'
    });
    // Acquisition anterieure a la periode : l'avis est servi.
    const file = await getChargeCallNoticeForCoOwner(scopeSince(d('2026-08-15')), callL1.id);
    expect(file.mimeType).toBe('application/pdf');
    expect(file.buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('generation manuelle depuis le budget (correctif periodsPerYear)', () => {
  const base = {
    label: 'Appel',
    period: '2026-Q4',
    dueDate: d('2026-10-31'),
    batchType: 'REGULAR' as const,
    currency: 'XOF'
  };

  it('par defaut : quote-part annuelle entiere (comportement historique)', async () => {
    await generateChargeCallsFromBudget(TENANT_A, S1, BUD1, base);
    expect(amountsByLot(calls())).toEqual({ [L1]: 12000, [L2]: 8000.05 });
    expect(Number(batches()[0].totalAmount)).toBe(20000.05);
  });

  it('periodsPerYear 4 : quart de la quote-part, derniere periode avec l arrondi', async () => {
    await generateChargeCallsFromBudget(TENANT_A, S1, BUD1, { ...base, periodsPerYear: 4, periodIndex: 1 });
    expect(amountsByLot(calls())).toEqual({ [L1]: 3000, [L2]: 2000.01 });
    mockPrisma.chargeCall.rows = [];
    mockPrisma.chargeCallBatch.rows = [];
    await generateChargeCallsFromBudget(TENANT_A, S1, BUD1, { ...base, periodsPerYear: 4, periodIndex: 4 });
    expect(amountsByLot(calls())).toEqual({ [L1]: 3000, [L2]: 2000.02 });
    expect(Number(batches()[0].totalAmount)).toBe(5000.02);
  });
});

describe('lot desactive apres repartition du budget (M1)', () => {
  const base = {
    label: 'Appel',
    period: '2026-Q4',
    dueDate: d('2026-10-31'),
    batchType: 'REGULAR' as const,
    currency: 'XOF'
  };

  // Budget de 1 050 000 reparti au prorata des tantiemes 600 / 400 / 50 (parking P1), puis P1 desactive.
  function distributeThenDeactivateParking() {
    const budget = mockPrisma.syndicateBudget.rows.find(row => row.id === BUD1)!;
    budget.totalAmount = 1050000;
    (budget as any).lines = [
      { id: 'line-1', category: 'Ascenseur', amountForecast: 1050000, distributionKey: 'GENERAL_SHARES' }
    ];
    budget.allocations = [
      { budgetId: BUD1, lotId: L1, totalAllocated: 600000 },
      { budgetId: BUD1, lotId: L2, totalAllocated: 400000 },
      { budgetId: BUD1, lotId: P1, totalAllocated: 50000 }
    ];
    mockPrisma.syndicateLot.rows.find(row => row.id === P1)!.generalShares = 0;
  }

  it('l appel suivant n appelle plus le lot desactive et les parts somment au budget', async () => {
    distributeThenDeactivateParking();
    await generateChargeCallsFromBudget(TENANT_A, S1, BUD1, base);
    const byLot = amountsByLot(calls());
    expect(byLot[P1]).toBeUndefined();
    // 1 050 000 x 600 / 1 000 = 630 000 ; x 400 / 1 000 = 420 000.
    expect(byLot).toEqual({ [L1]: 630000, [L2]: 420000 });
    expect((Object.values(byLot) as number[]).reduce((sum, value) => sum + value, 0)).toBe(1050000);
  });

  it('la programmation automatique (apercu puis emission) ignore aussi le lot desactive', async () => {
    distributeThenDeactivateParking();
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), 'user-1', NOW);
    const preview = await previewChargeSchedule(TENANT_A, S1, schedule.id, NOW);
    expect(JSON.stringify(preview)).not.toContain(P1);
    await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(calls().map(row => row.lotId)).not.toContain(P1);
  });
});

// ---------------------------------------------------------------------------
// Suites de l'audit de securite du lot S4
// ---------------------------------------------------------------------------

describe('tache quotidienne : etat de l agence et abonnement', () => {
  async function dueSchedule() {
    const schedule = await createChargeSchedule(TENANT_A, S1, input({ startDate: d('2026-10-01') }), null, NOW);
    return schedule;
  }

  async function expectDenied(reason: string) {
    const schedule = await dueSchedule();
    const report = await runDueChargeSchedules(d('2026-10-01T06:00:00.000Z'));
    expect(report).toMatchObject({ schedules: 1, success: 0, skipped: 1, failed: 0 });
    expect(report.denied).toEqual([{ tenantId: TENANT_A, syndicateId: S1, scheduleId: schedule.id, reason }]);
    expect(calls()).toHaveLength(0);
    expect(batches()).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(runs().map(run => [run.status, run.error, run.periodLabel])).toEqual([['FAILED', reason, 'Octobre 2026']]);
    // La programmation avance : pas de rafale a la reactivation.
    expect(scheduleRow(schedule.id)).toMatchObject({ active: true, nextRunAt: d('2026-11-01') });
    return schedule;
  }

  it('agence suspendue : aucun appel, aucun e-mail ; periode rejouable a la main', async () => {
    mockPrisma.tenant.rows.find(row => row.id === TENANT_A)!.status = 'SUSPENDED';
    const schedule = await expectDenied('TENANT_INACTIVE');
    expect(mockGetEntitlements).not.toHaveBeenCalled();

    // Reactivee, le gestionnaire rejoue octobre : l'echec est remplace.
    mockPrisma.tenant.rows.find(row => row.id === TENANT_A)!.status = 'ACTIVE';
    const replay = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, d('2026-10-20'));
    expect(replay.run).toMatchObject({ status: 'SUCCESS', periodLabel: 'Octobre 2026', callsCreated: 2 });
    expect(runs().map(run => run.status)).toEqual(['SUCCESS']);
  });

  it('abonnement en lecture seule : refus', async () => {
    mockGetEntitlements.mockImplementation(async () => ({ ...fullEntitlements(), readOnly: true }));
    await expectDenied('SUBSCRIPTION_DENIED');
    expect(mockGetEntitlements).toHaveBeenCalledWith(TENANT_A, { fresh: true, now: d('2026-10-01T06:00:00.000Z') });
  });

  it('module Syndic absent : refus', async () => {
    mockGetEntitlements.mockImplementation(async () => ({ ...fullEntitlements(), moduleAccess: {} }));
    await expectDenied('SUBSCRIPTION_DENIED');
  });

  it('mode warn : le refus est seulement journalise, l emission continue', async () => {
    mockGetEntitlements.mockImplementation(async () => ({ enforcement: 'warn', moduleAccess: {}, readOnly: true }));
    await dueSchedule();
    const report = await runDueChargeSchedules(d('2026-10-01T06:00:00.000Z'));
    expect(report).toMatchObject({ success: 1, denied: [] });
    expect(calls()).toHaveLength(2);
  });

  it('droits calcules une seule fois par agence et par passage', async () => {
    await createChargeSchedule(TENANT_A, S1, input({ startDate: d('2026-10-01') }), null, NOW);
    await createChargeSchedule(TENANT_A, S2, input({ budgetId: null, startDate: d('2026-10-01') }), null, NOW);
    await runDueChargeSchedules(d('2026-10-01T06:00:00.000Z'));
    expect(mockGetEntitlements).toHaveBeenCalledTimes(1);
  });
});

describe('destinataire de l avis', () => {
  it('portail : le contact de la session, pas le proprietaire lie au lot', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    const l2Call = calls().find(call => call.lotId === L2)!;
    const render = jest.spyOn(noticePdf, 'renderChargeCallNoticePdf');
    const scope: CoOwnerPortalScope = {
      tenantId: TENANT_A,
      contactIds: [AWA],
      lots: [{ lotId: L2, syndicateId: S1, contactId: AWA, ownershipPercentage: 100, ownedSince: d('2026-01-01') }],
      lotIds: [L2],
      syndicateIds: [S1]
    };
    await getChargeCallNoticeForCoOwner(scope, l2Call.id);
    expect(render.mock.calls[0][0].coowner).toEqual({ name: 'Awa Kone', address: 'Cocody' });
    render.mockRestore();
  });

  it('e-mail : proprietaire du lot absent des copropriétaires actuels -> non envoye, note au journal', async () => {
    mockPrisma.lotOwnerProfile.rows.push(
      { id: id(41), lotId: L2, contactId: AWA, isActive: true, ownedUntil: null },
      // Bakary, ancien proprietaire : fiche close.
      { id: id(42), lotId: L2, contactId: BAKARY, isActive: true, ownedUntil: d('2026-06-30') }
    );
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run).toMatchObject({ status: 'SUCCESS', notificationsSent: 1, notificationsSkipped: 1 });
    expect(mockSendEmail.mock.calls.map(([mail]) => mail.to)).toEqual(['awa@example.test']);
    const [history] = await listChargeScheduleRuns(TENANT_A, S1, schedule.id, { limit: 5 });
    expect(history).toMatchObject({ notificationsSkipped: 1 });
    expect(history.notes).toContain('A-02');
  });

  it('e-mail : lot sans fiche de copropriétaire -> comportement historique', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run).toMatchObject({ notificationsSent: 2, notificationsSkipped: 0 });
  });

  it('e-mail : les valeurs injectees dans le HTML sont echappees', async () => {
    const lot = mockPrisma.syndicateLot.rows.find(row => row.id === L1)!;
    lot.owner = { ...lot.owner, firstName: '<img src=x onerror=alert(1)>' };
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    const mail = mockSendEmail.mock.calls.find(([params]) => params.to === 'awa@example.test')![0];
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('correctif BUG-2026-09-27 : lot sans ownerContactId mais avec coownerId (creation via Profils et copropriétaires) -> avis envoye au coproprietaire', async () => {
    // Avant correctif, notifyChargeCall ne lisait que `lot.owner`
    // (`ownerContactId`) : un lot cree par l'ecran des copropriétaires, qui
    // ne renseigne que `coownerId`, tombait systematiquement en NO_OWNER.
    const lot = mockPrisma.syndicateLot.rows.find(row => row.id === L1)!;
    lot.ownerContactId = null;
    lot.owner = null;
    lot.coownerId = BAKARY;
    lot.coowner = contacts[BAKARY];
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run).toMatchObject({ status: 'SUCCESS', notificationsSent: 2, notificationsSkipped: 0 });
    expect(mockSendEmail.mock.calls.map(([mail]) => mail.to)).toEqual(['bakary@example.test', 'bakary@example.test']);
  });

  it('noticeSentAt : pose quand un avis part, jamais quand aucun avis ne part', async () => {
    const lot = mockPrisma.syndicateLot.rows.find(row => row.id === L2)!;
    lot.owner = null;
    lot.ownerContactId = null;
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    const l1Call = calls().find(call => call.lotId === L1)!;
    const l2Call = calls().find(call => call.lotId === L2)!;
    expect(l1Call.noticeSentAt).toBeInstanceOf(Date);
    expect(l2Call.noticeSentAt).toBeFalsy();
  });
});

describe('notifyUncoveredCalls : chaque appel non notifie compte en skipped, avec sa raison', () => {
  // BUG-2026-09-27-009 : avant correctif, seul OWNER_NOT_CURRENT etait compte ;
  // NO_OWNER_CONTACT, aucun canal, et une exception ne comptaient nulle part
  // (0 envoyee, 0 ignoree, aucune note). Invariant verifie ici pour chaque
  // raison : notificationsSent + notificationsSkipped === callsCreated.

  it('lot sans copropriétaire (NO_OWNER_CONTACT) -> ignore, note dediee', async () => {
    const lot = mockPrisma.syndicateLot.rows.find(row => row.id === L2)!;
    lot.owner = null;
    lot.ownerContactId = null;
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run).toMatchObject({
      status: 'SUCCESS',
      callsCreated: 2,
      notificationsSent: 1,
      notificationsSkipped: 1
    });
    const [history] = await listChargeScheduleRuns(TENANT_A, S1, schedule.id, { limit: 5 });
    expect(history.notes).toBe('Avis non envoyé (lot sans copropriétaire) : A-02');
  });

  it('copropriétaire sans e-mail ni WhatsApp (NO_EMAIL) -> ignore, note dediee', async () => {
    const lot = mockPrisma.syndicateLot.rows.find(row => row.id === L1)!;
    lot.owner = { ...lot.owner, email: null };
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run).toMatchObject({
      status: 'SUCCESS',
      callsCreated: 2,
      notificationsSent: 1,
      notificationsSkipped: 1
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const [history] = await listChargeScheduleRuns(TENANT_A, S1, schedule.id, { limit: 5 });
    expect(history.notes).toBe('Avis non envoyé (copropriétaire sans e-mail ni WhatsApp exploitable) : A-01');
  });

  it('notification e-mail desactivee pour l agence (NOTIFICATION_DISABLED) -> ignore, note dediee', async () => {
    mockGetEmailNotificationConfig.mockImplementation(async () => ({
      enabled: false,
      subjectOverride: null,
      bodyHtmlOverride: null
    }));
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run).toMatchObject({
      status: 'SUCCESS',
      callsCreated: 2,
      notificationsSent: 0,
      notificationsSkipped: 2
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
    const [history] = await listChargeScheduleRuns(TENANT_A, S1, schedule.id, { limit: 5 });
    expect(history.notes).toContain("Avis non envoyé (notification e-mail désactivée pour l'agence)");
  });

  it('serveur sans transport e-mail configure (EMAIL_NOT_CONFIGURED) -> aucune tentative, note dediee', async () => {
    mockIsEmailDeliveryConfigured.mockImplementation(() => false);
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run).toMatchObject({
      status: 'SUCCESS',
      callsCreated: 2,
      notificationsSent: 0,
      notificationsSkipped: 2
    });
    // Ni l'e-mail ni la config de notification ne sont consultes : on sait deja qu'il ne partira pas.
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockGetEmailNotificationConfig).not.toHaveBeenCalled();
    const [history] = await listChargeScheduleRuns(TENANT_A, S1, schedule.id, { limit: 5 });
    expect(history.notes).toContain("Avis non envoyé (envoi d'e-mails non configuré sur le serveur)");
  });

  it('exception de notifyChargeCall (e-mail en echec) -> ignore, note dediee avec motif court, catchee dans notifyChargeCall', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
    mockSendEmail.mockImplementationOnce(async () => {
      throw Object.assign(new Error('rejected'), { responseCode: 550, response: '550 mailbox unavailable' });
    });
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run).toMatchObject({
      status: 'SUCCESS',
      callsCreated: 2,
      notificationsSent: 1,
      notificationsSkipped: 1
    });
    const [history] = await listChargeScheduleRuns(TENANT_A, S1, schedule.id, { limit: 5 });
    // Motif court et non sensible (code + reponse SMTP), jamais les identifiants du transporteur.
    expect(history.notes).toBe("Avis non envoyé (échec de l'envoi) : A-01 (550 550 mailbox unavailable)");
    expect(warn).toHaveBeenCalledWith(
      'notifyChargeCall: email send failed',
      expect.objectContaining({ error: 'rejected' })
    );
    warn.mockRestore();
  });

  it('deux raisons dans la meme execution -> une ligne par raison dans notes, invariant respecte', async () => {
    mockPrisma.lotOwnerProfile.rows.push({
      id: id(43),
      lotId: L1,
      contactId: BAKARY,
      isActive: true,
      ownedUntil: null
    });
    const lot = mockPrisma.syndicateLot.rows.find(row => row.id === L2)!;
    lot.owner = null;
    lot.ownerContactId = null;
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run).toMatchObject({
      status: 'SUCCESS',
      callsCreated: 2,
      notificationsSent: 0,
      notificationsSkipped: 2
    });
    const [history] = await listChargeScheduleRuns(TENANT_A, S1, schedule.id, { limit: 5 });
    expect(history.notes?.split('\n')).toEqual([
      'Avis non envoyé (propriétaire du lot différent du copropriétaire actuel) : A-01',
      'Avis non envoyé (lot sans copropriétaire) : A-02'
    ]);
  });
});

describe('renvoi des avis non envoyes (item 4, anomalie recette)', () => {
  it('renvoie les appels encore dus sans avis parti, recalcule les compteurs et les notes', async () => {
    mockGetEmailNotificationConfig.mockImplementation(async () => ({
      enabled: false,
      subjectOverride: null,
      bodyHtmlOverride: null
    }));
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const executed = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(executed.run).toMatchObject({ notificationsSent: 0, notificationsSkipped: 2 });
    expect(mockSendEmail).not.toHaveBeenCalled();

    // L'agence réactive la notification, puis renvoie — une minute plus tard (garde anti-rafale).
    mockGetEmailNotificationConfig.mockImplementation(async () => ({
      enabled: true,
      subjectOverride: null,
      bodyHtmlOverride: null
    }));
    const later = new Date(NOW.getTime() + 2 * 60 * 1000);
    const resent = await resendChargeScheduleRunNotices(TENANT_A, S1, schedule.id, executed.run.runId!, later);
    expect(resent).toMatchObject({ resent: 2, stillSkipped: 0 });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);

    const [history] = await listChargeScheduleRuns(TENANT_A, S1, schedule.id, { limit: 5 });
    expect(history).toMatchObject({ notificationsSent: 2, notificationsSkipped: 0, notes: null });

    const l1Call = calls().find(call => call.lotId === L1)!;
    expect(l1Call.noticeSentAt).toBeInstanceOf(Date);
  });

  it('rien a renvoyer (tous les avis dus deja envoyes) -> 409', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const executed = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(executed.run).toMatchObject({ notificationsSent: 2, notificationsSkipped: 0 });
    const later = new Date(NOW.getTime() + 2 * 60 * 1000);
    await expect(
      resendChargeScheduleRunNotices(TENANT_A, S1, schedule.id, executed.run.runId!, later)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('execution sans appel emis (FAILED : budget non approuve) -> 409', async () => {
    // S2 / BUD2 est en brouillon (voir `seed`) : aucun appel n'est emis.
    const schedule = await createChargeSchedule(TENANT_A, S2, input({ budgetId: BUD2 }), null, NOW);
    const executed = await executeChargeScheduleNow(TENANT_A, S2, schedule.id, NOW);
    expect(executed.run.status).toBe('FAILED');
    const later = new Date(NOW.getTime() + 2 * 60 * 1000);
    await expect(
      resendChargeScheduleRunNotices(TENANT_A, S2, schedule.id, executed.run.runId!, later)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('garde anti-rafale : un second renvoi a moins d une minute du precedent est refuse', async () => {
    mockGetEmailNotificationConfig.mockImplementation(async () => ({
      enabled: false,
      subjectOverride: null,
      bodyHtmlOverride: null
    }));
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const executed = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    mockGetEmailNotificationConfig.mockImplementation(async () => ({
      enabled: true,
      subjectOverride: null,
      bodyHtmlOverride: null
    }));
    const soon = new Date(NOW.getTime() + 30 * 1000);
    await expect(
      resendChargeScheduleRunNotices(TENANT_A, S1, schedule.id, executed.run.runId!, soon)
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('deux renvois simultanes : un seul envoie, l autre recoit 409', async () => {
    mockGetEmailNotificationConfig.mockImplementation(async () => ({
      enabled: false,
      subjectOverride: null,
      bodyHtmlOverride: null
    }));
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const executed = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    mockGetEmailNotificationConfig.mockImplementation(async () => ({
      enabled: true,
      subjectOverride: null,
      bodyHtmlOverride: null
    }));
    const later = new Date(NOW.getTime() + 5 * 60 * 1000);
    const outcomes = await Promise.allSettled([
      resendChargeScheduleRunNotices(TENANT_A, S1, schedule.id, executed.run.runId!, later),
      resendChargeScheduleRunNotices(TENANT_A, S1, schedule.id, executed.run.runId!, later)
    ]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ statusCode: 409 });
    const sentTo = mockSendEmail.mock.calls.map(call => (call[0] as any).to);
    expect(new Set(sentTo).size).toBe(sentTo.length);
  });

  it('run d une autre agence, ou programmation inexistante -> 404 (comme un run inexistant)', async () => {
    const scheduleA = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const executed = await executeChargeScheduleNow(TENANT_A, S1, scheduleA.id, NOW);
    const later = new Date(NOW.getTime() + 2 * 60 * 1000);
    await expect(
      resendChargeScheduleRunNotices(TENANT_B, SB, scheduleA.id, executed.run.runId!, later)
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(resendChargeScheduleRunNotices(TENANT_A, S1, scheduleA.id, id(999), later)).rejects.toMatchObject({
      statusCode: 404
    });
  });
});

describe('erreurs techniques et doublons', () => {
  it('une erreur Prisma ne ressort ni dans le journal ni dans l apercu', async () => {
    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const secret = 'PrismaClientKnownRequestError: column "password_hash" leaked';
    mockPrisma.syndicateLot.findMany.mockImplementationOnce(async () => {
      throw new Error(secret);
    });
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run).toMatchObject({ status: 'FAILED', error: TECHNICAL_ERROR_MESSAGE });
    expect(JSON.stringify(result)).not.toContain('password_hash');
    expect(runs()[0].error).toBe(TECHNICAL_ERROR_MESSAGE);

    mockPrisma.syndicateLot.findMany.mockImplementationOnce(async () => {
      throw new Error(secret);
    });
    const preview = await previewChargeSchedule(TENANT_A, S1, schedule.id, NOW);
    expect(preview.periods[0].error).toBe(TECHNICAL_ERROR_MESSAGE);
  });

  it('P2002 : seule la contrainte (programmation, periode) vaut « deja traitee »', async () => {
    const p2002 = (target: unknown) => Object.assign(new Error('unique'), { code: 'P2002', meta: { target } });
    expect(isPeriodReservationConflict(p2002(['schedule_id', 'period_start']))).toBe(true);
    expect(isPeriodReservationConflict(p2002('syndic_charge_schedule_runs_schedule_id_period_start_key'))).toBe(true);
    expect(isPeriodReservationConflict(p2002(['tenant_id', 'issuer_key', 'number']))).toBe(false);
    expect(isPeriodReservationConflict(p2002(undefined))).toBe(false);

    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    mockPrisma.chargeCallBatch.create.mockImplementationOnce(async () => {
      // La base en memoire n'annule rien : on simule le retour arriere de la transaction.
      mockPrisma.syndicChargeScheduleRun.rows = [];
      throw p2002(['tenant_id', 'issuer_key', 'number']);
    });
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run).toMatchObject({ status: 'FAILED', alreadyProcessed: false, error: TECHNICAL_ERROR_MESSAGE });
  });

  it('programmations actives qui se chevauchent : 409 a la creation et a la reprise', async () => {
    const first = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    await expect(
      createChargeSchedule(TENANT_A, S1, input({ frequency: 'QUARTERLY', startDate: d('2027-01-01') }), null, NOW)
    ).rejects.toMatchObject({ statusCode: 409 });
    // Autre copropriete : aucun conflit.
    await expect(createChargeSchedule(TENANT_A, S2, input({ budgetId: null }), null, NOW)).resolves.toBeTruthy();

    await pauseChargeSchedule(TENANT_A, S1, first.id);
    const second = await createChargeSchedule(TENANT_A, S1, input({ frequency: 'QUARTERLY' }), null, NOW);
    await expect(resumeChargeSchedule(TENANT_A, S1, first.id, NOW)).rejects.toMatchObject({ statusCode: 409 });

    // Calendriers disjoints : acceptes.
    await pauseChargeSchedule(TENANT_A, S1, second.id);
    await updateChargeSchedule(TENANT_A, S1, first.id, { endDate: d('2026-12-31') }, NOW);
    await resumeChargeSchedule(TENANT_A, S1, first.id, NOW);
    await expect(
      createChargeSchedule(TENANT_A, S1, input({ startDate: d('2027-01-01') }), null, NOW)
    ).resolves.toBeTruthy();
  });

  it('lot d appels ordinaire deja emis sur la periode : programmation et generation manuelle refusees', async () => {
    const manual = {
      label: 'Septembre',
      period: '2026-09',
      dueDate: d('2026-09-30'),
      batchType: 'REGULAR' as const,
      currency: 'XOF',
      periodsPerYear: 12,
      periodIndex: 9
    };
    await generateChargeCallsFromBudget(TENANT_A, S1, BUD1, manual);
    await expect(generateChargeCallsFromBudget(TENANT_A, S1, BUD1, manual)).rejects.toMatchObject({ statusCode: 409 });
    // Un appel exceptionnel reste possible.
    await expect(
      generateChargeCallsFromBudget(TENANT_A, S1, BUD1, { ...manual, batchType: 'EXCEPTIONAL' })
    ).resolves.toBeTruthy();

    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    const result = await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW);
    expect(result.run.status).toBe('FAILED');
    expect(result.run.error).toContain("Un lot d'appels ordinaire existe déjà");
    expect(batches()).toHaveLength(2);
  });
});

describe('avis d appel : ni signature ni cachet', () => {
  it('le generateur de l avis ne recoit ni signature ni cachet, logos conserves (gestion, portail, e-mail)', async () => {
    const image = (name: string) => ({ format: 'png', bytes: Buffer.from(name) }) as any;
    const branding = jest.spyOn(documentBranding, 'resolveDocumentBranding').mockImplementation(async () => ({
      issuer: {
        kind: 'MANDANT',
        name: 'Cabinet Mandant',
        legalName: null,
        address: null,
        phone: null,
        email: null,
        rccm: null,
        taxId: null
      },
      issuerLogo: image('logo'),
      signature: image('signature'),
      stamp: image('cachet'),
      syndicate: {
        name: 'Residence',
        address: null,
        registrationNo: null,
        cadastralReference: null,
        logo: image('logo-copro')
      }
    }));
    const render = jest
      .spyOn(noticePdf, 'renderChargeCallNoticePdf')
      .mockImplementation(async () => Buffer.from('%PDF-avis'));

    const schedule = await createChargeSchedule(TENANT_A, S1, input(), null, NOW);
    await executeChargeScheduleNow(TENANT_A, S1, schedule.id, NOW); // e-mails : avis joint
    const l1Call = calls().find(call => call.lotId === L1)!;
    await getChargeCallNoticeForTenant(TENANT_A, S1, l1Call.id);
    await getChargeCallNoticeForCoOwner(
      {
        tenantId: TENANT_A,
        contactIds: [AWA],
        lots: [{ lotId: L1, syndicateId: S1, contactId: AWA, ownershipPercentage: 100, ownedSince: d('2026-01-01') }],
        lotIds: [L1],
        syndicateIds: [S1]
      },
      l1Call.id
    );

    expect(render.mock.calls.length).toBeGreaterThanOrEqual(4);
    for (const [, used] of render.mock.calls) {
      expect(used.signature).toBeNull();
      expect(used.stamp).toBeNull();
      expect(used.issuerLogo).not.toBeNull();
      expect(used.syndicate?.logo).not.toBeNull();
    }
    render.mockRestore();
    branding.mockRestore();
  });
});
