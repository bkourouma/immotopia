/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Relances groupées (aperçu + exécution partagent une même sélection) et cause d'échec
 * des relances (deliverReminderNotification). Prisma est mocké par modèle.
 */

const mockPrisma: any = {
  syndicate: { findFirst: jest.fn(async () => ({ id: 'S1' })) },
  chargeCall: { findMany: jest.fn() },
  paymentReminder: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  paymentSchedule: { findMany: jest.fn() },
  reminderConfig: { findMany: jest.fn() },
  syndicDeclaredPaymentSettings: { findFirst: jest.fn(async () => null) },
  $transaction: jest.fn()
};
mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const mockPendingDeclarations = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/declaration-queries', () => ({
  ...jest.requireActual('../../src/lib/syndics/declared-payment/declaration-queries'),
  pendingDeclarationsByCall: (...args: any[]) => mockPendingDeclarations(...args)
}));

const mockNotify = jest.fn();
jest.mock('../../src/lib/syndics/notifications', () => ({
  ...jest.requireActual('../../src/lib/syndics/notifications'),
  notifyChargeCallReminder: (...args: any[]) => mockNotify(...args)
}));

import { previewReminderBatchForSyndicate, runReminderBatchForSyndicate } from '../../src/lib/syndics/queries';
import { deliverReminderNotification } from '../../src/lib/syndics/reminder-delivery';

const TENANT = 'tenant-a';
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

function call(id: string, lotId = `lot-${id}`) {
  return {
    id,
    lotId,
    period: '2026-01',
    currency: 'XOF',
    amount: 10000,
    dueDate: daysAgo(60),
    allocations: [],
    lot: { lotNumber: `N-${id}` }
  };
}

function setup(opts: {
  calls: any[];
  reminders?: Array<{ chargeCallId: string; status: string; sentAt: Date }>;
  plansLotIds?: string[];
  configs?: Array<{ level: number; delayDays: number }>;
}) {
  mockPrisma.chargeCall.findMany.mockResolvedValue(opts.calls);
  mockPrisma.paymentReminder.findMany.mockResolvedValue(opts.reminders ?? []);
  mockPrisma.paymentSchedule.findMany.mockResolvedValue((opts.plansLotIds ?? []).map(lotId => ({ lotId })));
  mockPrisma.reminderConfig.findMany.mockResolvedValue(opts.configs ?? []);
}

const reminders = (callId: string, ...items: Array<[string, number]>) =>
  items.map(([status, age]) => ({ chargeCallId: callId, status, sentAt: daysAgo(age) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'S1' });
  mockPendingDeclarations.mockResolvedValue(new Map());
  let n = 0;
  mockPrisma.paymentReminder.create.mockImplementation(async ({ data }: any) => ({ id: `rem-${++n}`, ...data }));
});

describe('selection des relances groupees', () => {
  it('un appel jamais relance est eligible au niveau 1', async () => {
    setup({ calls: [call('c1')] });
    const preview = await previewReminderBatchForSyndicate(TENANT, 'S1');
    expect(preview.totals).toEqual({ eligible: 1, excluded: 0 });
    expect(preview.eligible[0]).toMatchObject({
      chargeCallId: 'c1',
      lotNumber: 'N-c1',
      period: '2026-01',
      outstanding: 10000,
      currency: 'XOF',
      currentLevel: 0,
      nextLevel: 1,
      lastReminderAt: null
    });
    expect(mockPrisma.paymentReminder.create).not.toHaveBeenCalled();
  });

  it('exclut un lot avec plan de paiement ACTIVE (filtre par agence)', async () => {
    setup({ calls: [call('c1', 'lot-plan'), call('c2')], plansLotIds: ['lot-plan'] });
    const preview = await previewReminderBatchForSyndicate(TENANT, 'S1');
    expect(preview.excluded).toEqual([
      expect.objectContaining({
        chargeCallId: 'c1',
        reason: 'PAYMENT_PLAN_ACTIVE',
        reasonLabel: 'plan de paiement actif'
      })
    ]);
    expect(preview.eligible.map(item => item.chargeCallId)).toEqual(['c2']);
    expect(mockPrisma.paymentSchedule.findMany.mock.calls[0][0].where).toMatchObject({
      status: 'ACTIVE',
      lot: { syndicate: { tenantId: TENANT } }
    });
  });

  it('exclut une relance de moins de 7 jours, accepte celle de 7 jours', async () => {
    setup({
      calls: [call('c1'), call('c2')],
      reminders: [...reminders('c1', ['SENT', 3]), ...reminders('c2', ['SENT', 8])]
    });
    const preview = await previewReminderBatchForSyndicate(TENANT, 'S1');
    expect(preview.excluded).toEqual([
      expect.objectContaining({
        chargeCallId: 'c1',
        reason: 'REMINDER_TOO_RECENT',
        reasonLabel: 'relance trop récente'
      })
    ]);
    expect(preview.eligible[0]).toMatchObject({ chargeCallId: 'c2', currentLevel: 1, nextLevel: 2 });
    expect(preview.eligible[0].lastReminderAt).toBeInstanceOf(Date);
  });

  it('utilise le delai ReminderConfig du niveau suivant', async () => {
    setup({
      calls: [call('c1')],
      reminders: reminders('c1', ['SENT', 10]),
      configs: [
        { level: 2, delayDays: 15 },
        { level: 3, delayDays: 2 }
      ]
    });
    let preview = await previewReminderBatchForSyndicate(TENANT, 'S1');
    expect(preview.excluded[0]).toMatchObject({ reason: 'REMINDER_TOO_RECENT' });

    setup({
      calls: [call('c1')],
      reminders: reminders('c1', ['SENT', 20], ['SENT', 3]),
      configs: [{ level: 3, delayDays: 2 }]
    });
    preview = await previewReminderBatchForSyndicate(TENANT, 'S1');
    expect(preview.eligible[0]).toMatchObject({ currentLevel: 2, nextLevel: 3 });
  });

  it('le niveau suivant est plafonne a 4', async () => {
    setup({
      calls: [call('c1')],
      reminders: reminders('c1', ['SENT', 90], ['SENT', 80], ['SENT', 70], ['SENT', 60], ['SENT', 50])
    });
    const preview = await previewReminderBatchForSyndicate(TENANT, 'S1');
    expect(preview.eligible[0]).toMatchObject({ currentLevel: 4, nextLevel: 4 });
  });

  it('une relance FAILED ne retarde pas la suivante (mais compte pour le niveau)', async () => {
    setup({ calls: [call('c1')], reminders: reminders('c1', ['FAILED', 1]) });
    const preview = await previewReminderBatchForSyndicate(TENANT, 'S1');
    expect(preview.eligible[0]).toMatchObject({ nextLevel: 2, lastReminderAt: null });
  });

  it('exclut une declaration de paiement en attente (motif DECLARED_PAYMENT_PENDING)', async () => {
    setup({ calls: [call('c1')] });
    mockPendingDeclarations.mockResolvedValue(new Map([['c1', { declarationId: 'd1', createdAt: new Date() }]]));
    const preview = await previewReminderBatchForSyndicate(TENANT, 'S1');
    expect(preview.excluded[0]).toMatchObject({
      reason: 'DECLARED_PAYMENT_PENDING',
      reasonLabel: 'paiement déclaré en cours de vérification'
    });
  });

  it("l'execution cree exactement les relances de l'apercu et compte les exclusions", async () => {
    setup({
      calls: [call('c1'), call('c2', 'lot-plan'), call('c3')],
      reminders: reminders('c3', ['SENT', 2]),
      plansLotIds: ['lot-plan']
    });
    const preview = await previewReminderBatchForSyndicate(TENANT, 'S1');
    const result = await runReminderBatchForSyndicate(TENANT, 'S1');
    expect(result.createdReminderIds).toHaveLength(preview.totals.eligible);
    expect(result).toMatchObject({
      processedCalls: 3,
      remindersCreated: 1,
      excludedByReason: { PAYMENT_PLAN_ACTIVE: 1, REMINDER_TOO_RECENT: 1 }
    });
    expect(result.excluded).toEqual(preview.excluded);
    expect(mockPrisma.paymentReminder.create.mock.calls[0][0].data).toMatchObject({
      chargeCallId: 'c1',
      reminderLevel: 1,
      status: 'SENT'
    });
  });
});

describe('deliverReminderNotification', () => {
  const written = () => mockPrisma.paymentReminder.updateMany.mock.calls;

  it('succes : aucune ecriture', async () => {
    mockNotify.mockResolvedValue({ emailSent: true, whatsappSent: false });
    expect(await deliverReminderNotification('r1', TENANT)).toEqual({ notificationFailed: false });
    expect(written()).toHaveLength(0);
  });

  it('exception SMTP classee, message generique, texte brut jamais renvoye', async () => {
    mockNotify.mockRejectedValue(Object.assign(new Error('554 secret detail'), { responseCode: 554 }));
    const result = await deliverReminderNotification('r1', TENANT);
    expect(result).toEqual({
      notificationFailed: true,
      failureCode: 'SMTP_REJECTED',
      failureMessage: "Le serveur de messagerie a refusé l'e-mail."
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(written()[0][0]).toEqual({
      where: { id: 'r1', chargeCall: { syndicate: { tenantId: TENANT } } },
      data: {
        status: 'FAILED',
        failureCode: 'SMTP_REJECTED',
        failureMessage: "Le serveur de messagerie a refusé l'e-mail."
      }
    });
  });

  it('timeout classe TIMEOUT', async () => {
    mockNotify.mockRejectedValue(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }));
    expect(await deliverReminderNotification('r1', TENANT)).toMatchObject({ failureCode: 'TIMEOUT' });
  });

  it.each([
    ['NO_OWNER_CONTACT', 'NO_OWNER', 'Aucun copropriétaire rattaché au lot.'],
    ['NO_EMAIL', 'NO_EMAIL', "Le copropriétaire n'a pas d'adresse e-mail."],
    ['NOTIFICATION_DISABLED', 'NOTIFICATION_DISABLED', "La notification de relance est désactivée pour l'agence."],
    ['ALREADY_PAID', 'ALREADY_PAID', "L'appel est déjà soldé."],
    ['REMINDER_NOT_FOUND', 'REMINDER_NOT_FOUND', 'Relance introuvable.']
  ])('skipped %s -> FAILED %s', async (skipped, code, message) => {
    mockNotify.mockResolvedValue({ emailSent: false, whatsappSent: false, skipped });
    expect(await deliverReminderNotification('r1', TENANT)).toEqual({
      notificationFailed: true,
      failureCode: code,
      failureMessage: message
    });
    expect(written()[0][0].data).toEqual({ status: 'FAILED', failureCode: code, failureMessage: message });
  });

  it("un echec d'ecriture du statut n'empeche pas le retour", async () => {
    mockNotify.mockResolvedValue({ emailSent: false, whatsappSent: false, skipped: 'NO_EMAIL' });
    mockPrisma.paymentReminder.updateMany.mockRejectedValue(new Error('db down'));
    expect(await deliverReminderNotification('r1', TENANT)).toMatchObject({ notificationFailed: true });
  });
});
