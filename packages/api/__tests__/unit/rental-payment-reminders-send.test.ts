/**
 * `lib/rental/payment-reminders/send.ts` et `history.ts` (contrat 049 section 3).
 * Prisma, plan, passerelle, canaux, liens securises et audit sont mockes a la
 * frontiere : aucun message reel, aucun jeton reel.
 */

const SECRET_URL = 'https://app.test/payer#tok_SECRET';

const mockPrisma: any = {
  rentalReceivingNumber: { findMany: jest.fn() },
  rentalPaymentReminder: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  rentalInstallment: { findFirst: jest.fn() },
  user: { findMany: jest.fn() },
  tenantClient: { findMany: jest.fn() },
  crmContact: { findMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../src/utils/logger', () => ({ logger: mockLogger }));

const mockLogAudit = jest.fn();
const mockFlushAudit = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => mockLogAudit(...a),
  flushAuditEvents: (...a: any[]) => mockFlushAudit(...a)
}));

const mockRevoke = jest.fn();
jest.mock('../../src/lib/secure-links', () => ({ revokeSecureLink: (...a: any[]) => mockRevoke(...a) }));

const mockCreateLink = jest.fn();
jest.mock('../../src/lib/payment-gateway/installment-payment-link', () => ({
  INSTALLMENT_OBJECT_TYPE: 'RentalInstallment',
  createInstallmentPaymentLink: (...a: any[]) => mockCreateLink(...a)
}));

jest.mock('../../src/lib/payment-gateway/checkout', () => ({
  resteDuEcheance: (i: any) => Number(i.amount_rent) - Number(i.amount_paid || 0)
}));

const mockEmailSend = jest.fn();
const mockWhatsappSend = jest.fn();
const mockLoadConfigs = jest.fn();
jest.mock('../../src/lib/patrimoine/notification-channels', () => ({
  CHANNEL_SENDERS: {
    EMAIL: { send: (...a: any[]) => mockEmailSend(...a) },
    WHATSAPP: { send: (...a: any[]) => mockWhatsappSend(...a) }
  },
  loadChannelConfigs: (...a: any[]) => mockLoadConfigs(...a)
}));

// Verrou consultatif simule : les sections de meme cle se suivent (file d'attente en memoire).
const lockTails = new Map<string, Promise<unknown>>();
jest.mock('../../src/lib/ai/advisory-lock', () => ({
  withTransactionalAdvisoryLock: (key: string, fn: (tx: unknown) => Promise<unknown>) => {
    const run = (lockTails.get(key) ?? Promise.resolve()).then(() => fn({}));
    lockTails.set(
      key,
      run.catch(() => undefined)
    );
    return run;
  }
}));

const mockPlan = jest.fn();
jest.mock('../../src/lib/rental/payment-reminders/plan', () => ({
  REMINDER_EVENT_TARGETS: {
    INSTALLMENT_DUE_REMINDER: { email: 'INSTALLMENT_DUE_REMINDER', whatsapp: 'INSTALLMENT_DUE_REMINDER' },
    INSTALLMENT_OVERDUE: { email: 'INSTALLMENT_OVERDUE', whatsapp: 'INSTALLMENT_OVERDUE' }
  },
  SEND_DAYS_BEFORE_WINDOW: 30,
  planReminders: (...a: any[]) => mockPlan(...a)
}));

import { AppError, ErrorCode, NotFoundError } from '../../src/middleware/error-middleware';
import {
  buildPaymentBlock,
  sendInstallmentReminder,
  sendReminderBatch
} from '../../src/lib/rental/payment-reminders/send';
import { listInstallmentReminders, listReminders } from '../../src/lib/rental/payment-reminders/history';

const TENANT = 'tenant-1';
const ACTOR = 'user-1';
const INST_A = '11111111-1111-4111-8111-111111111111';
const INST_B = '22222222-2222-4222-8222-222222222222';
const INST_C = '33333333-3333-4333-8333-333333333333';

function makePlan(id: string, over: any = {}): any {
  const { item: itemOver, ...rest } = over;
  return {
    item: {
      installmentId: id,
      leaseId: 'lease-1',
      leaseReference: 'B-001',
      propertyLabel: 'Villa',
      tenantClientId: 'client-1',
      tenantName: 'Awa Traore',
      periodYear: 2026,
      periodMonth: 9,
      dueDate: '2026-09-05T00:00:00.000Z',
      daysLate: 30,
      amountDue: 150000,
      currency: 'XOF',
      eventKey: 'INSTALLMENT_OVERDUE',
      nextLevel: 1,
      lastLevelSent: null,
      lastSentAt: null,
      channels: ['EMAIL', 'WHATSAPP'],
      paymentLinkIncluded: true,
      eligible: true,
      exclusions: [],
      ...itemOver
    },
    recipient: { contactId: 'c1', email: 'a@b.c' },
    contactName: 'Awa Traore',
    agencyName: 'Agence Test',
    leaseNumber: 'B-001',
    propertyAddress: '1 rue des Fleurs',
    usableChannels: ['EMAIL', 'WHATSAPP'],
    ...rest
  };
}

let reminderSeq = 0;
beforeEach(() => {
  jest.clearAllMocks();
  reminderSeq = 0;
  mockLoadConfigs.mockResolvedValue({});
  mockEmailSend.mockResolvedValue(true);
  mockWhatsappSend.mockResolvedValue(true);
  mockCreateLink.mockResolvedValue({
    link: { id: 'link-1', url: SECRET_URL, expiresAt: new Date('2026-12-01') },
    context: {}
  });
  mockRevoke.mockResolvedValue(undefined);
  mockPrisma.rentalReceivingNumber.findMany.mockResolvedValue([]);
  mockPrisma.rentalPaymentReminder.create.mockImplementation(async () => ({ id: `rem-${++reminderSeq}` }));
});

function noSecretLeak() {
  const dump = JSON.stringify([
    mockLogger.info.mock.calls,
    mockLogger.warn.mock.calls,
    mockLogger.error.mock.calls,
    mockLogAudit.mock.calls,
    mockPrisma.rentalPaymentReminder.create.mock.calls
  ]);
  expect(dump).not.toContain('tok_SECRET');
  expect(dump).not.toContain('app.test');
}

describe('buildPaymentBlock', () => {
  it('lien seul', () => {
    const r = buildPaymentBlock({ url: SECRET_URL, numbers: [] });
    expect(r.paymentUrl).toBe(SECRET_URL);
    expect(r.paymentBlock).toBe(`Payer en ligne : ${SECRET_URL}`);
  });

  it('lien et numeros (libelle sinon operateur)', () => {
    const r = buildPaymentBlock({
      url: SECRET_URL,
      numbers: [
        { operator: 'WAVE', phone: '0700000001', label: 'Caisse' },
        { operator: 'ORANGE_MONEY', phone: '0700000002', label: null }
      ]
    });
    expect(r.paymentBlock.split('\n')).toEqual([
      `Payer en ligne : ${SECRET_URL}`,
      'Ou par Mobile Money :',
      'Caisse : 0700000001',
      'ORANGE_MONEY : 0700000002'
    ]);
  });

  it('numeros sans lien', () => {
    const r = buildPaymentBlock({ url: null, numbers: [{ operator: 'WAVE', phone: '07', label: null }] });
    expect(r.paymentUrl).toBe('');
    expect(r.paymentBlock).toBe('Ou par Mobile Money :\nWAVE : 07');
  });

  it('ni lien ni numero : vide', () => {
    expect(buildPaymentBlock({ url: null, numbers: [] })).toEqual({ paymentUrl: '', paymentBlock: '' });
  });
});

describe('sendInstallmentReminder', () => {
  it('2 canaux OK : une ligne par canal, lien cree, audit sans URL', async () => {
    mockPlan.mockResolvedValue([makePlan(INST_A)]);
    mockPrisma.rentalReceivingNumber.findMany.mockResolvedValue([
      { operator: 'WAVE', phone: '0700000001', label: null }
    ]);

    const res = await sendInstallmentReminder(TENANT, ACTOR, INST_A, {});

    expect(res).toMatchObject({
      installmentId: INST_A,
      status: 'SENT',
      level: 1,
      reason: null,
      failureCode: null,
      paymentLinkId: 'link-1'
    });
    expect(res.channels).toEqual([
      { channel: 'EMAIL', status: 'SENT', failureCode: null, reminderId: 'rem-1' },
      { channel: 'WHATSAPP', status: 'SENT', failureCode: null, reminderId: 'rem-2' }
    ]);
    expect(mockCreateLink).toHaveBeenCalledWith(TENANT, INST_A, ACTOR);
    expect(mockLoadConfigs).toHaveBeenCalledTimes(1);
    expect(mockPrisma.rentalReceivingNumber.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT, is_active: true },
        select: { operator: true, phone: true, label: true },
        take: 5
      })
    );

    const sendArgs = mockEmailSend.mock.calls[0][0];
    expect(sendArgs.journal).toEqual({ relatedEntity: { type: 'RentalInstallment', id: INST_A } });
    expect(sendArgs.targets).toEqual({ email: 'INSTALLMENT_OVERDUE', whatsapp: 'INSTALLMENT_OVERDUE' });
    expect(sendArgs.variables).toMatchObject({
      renterName: 'Awa Traore',
      agencyName: 'Agence Test',
      leaseNumber: 'B-001',
      leaseLabel: 'B-001',
      period: '09/2026',
      dueDate: '05/09/2026',
      level: '1',
      paymentUrl: SECRET_URL
    });
    expect(sendArgs.variables.amount).toContain('XOF');
    expect(sendArgs.variables.dueAmount).toBe(sendArgs.variables.amount);
    expect(sendArgs.variables.paymentBlock).toContain('WAVE : 0700000001');

    expect(mockPrisma.rentalPaymentReminder.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.rentalPaymentReminder.create.mock.calls[0][0].data).toMatchObject({
      tenant_id: TENANT,
      installment_id: INST_A,
      lease_id: 'lease-1',
      level: 1,
      channel: 'EMAIL',
      status: 'SENT',
      sent_by: ACTOR,
      payment_link_id: 'link-1',
      failure_code: null
    });
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    expect(mockLogAudit.mock.calls[0][0]).toMatchObject({
      actorUserId: ACTOR,
      tenantId: TENANT,
      actionKey: 'RENTAL_PAYMENT_REMINDER_SENT',
      entityType: 'RentalInstallment',
      entityId: INST_A,
      payload: {
        installmentId: INST_A,
        leaseId: 'lease-1',
        level: 1,
        channels: ['EMAIL', 'WHATSAPP'],
        status: 'SENT',
        paymentLinkId: 'link-1'
      }
    });
    expect(mockFlushAudit).toHaveBeenCalled();
    expect(mockRevoke).not.toHaveBeenCalled();
    noSecretLeak();
  });

  it('un canal KO + un OK : SENT, lien conserve, ligne FAILED', async () => {
    mockPlan.mockResolvedValue([makePlan(INST_A)]);
    mockWhatsappSend.mockResolvedValue(false);

    const res = await sendInstallmentReminder(TENANT, ACTOR, INST_A, {});

    expect(res.status).toBe('SENT');
    expect(res.paymentLinkId).toBe('link-1');
    expect(res.channels.map(c => [c.channel, c.status, c.failureCode])).toEqual([
      ['EMAIL', 'SENT', null],
      ['WHATSAPP', 'FAILED', 'SEND_FAILED']
    ]);
    expect(mockPrisma.rentalPaymentReminder.create.mock.calls[1][0].data).toMatchObject({
      status: 'FAILED',
      failure_code: 'SEND_FAILED'
    });
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('tous KO : FAILED, lien revoque, lignes FAILED sans lien', async () => {
    mockPlan.mockResolvedValue([makePlan(INST_A)]);
    mockEmailSend.mockResolvedValue(false);
    mockWhatsappSend.mockRejectedValue(new Error(`boom ${SECRET_URL}`));

    const res = await sendInstallmentReminder(TENANT, ACTOR, INST_A, {});

    expect(res).toMatchObject({ status: 'FAILED', failureCode: 'SEND_FAILED', paymentLinkId: null });
    expect(res.channels.every(c => c.status === 'FAILED')).toBe(true);
    expect(mockRevoke).toHaveBeenCalledWith(TENANT, 'link-1', ACTOR, {
      objectType: 'RentalInstallment',
      objectId: INST_A
    });
    for (const call of mockPrisma.rentalPaymentReminder.create.mock.calls) {
      expect(call[0].data).toMatchObject({ status: 'FAILED', payment_link_id: null, failure_code: 'SEND_FAILED' });
    }
    expect(mockLogAudit.mock.calls[0][0].payload).toMatchObject({ status: 'FAILED', paymentLinkId: null });
    noSecretLeak();
  });

  it('erreur de revocation seulement journalisee', async () => {
    mockPlan.mockResolvedValue([makePlan(INST_A, { usableChannels: ['EMAIL'] })]);
    mockEmailSend.mockResolvedValue(false);
    mockRevoke.mockRejectedValue(new Error('db'));
    const res = await sendInstallmentReminder(TENANT, null, INST_A, {});
    expect(res.status).toBe('FAILED');
    expect(mockRevoke).toHaveBeenCalledWith(TENANT, 'link-1', 'system', expect.any(Object));
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('passerelle non utilisable : aucun lien cree', async () => {
    mockPlan.mockResolvedValue([makePlan(INST_A, { item: { paymentLinkIncluded: false } })]);
    const res = await sendInstallmentReminder(TENANT, ACTOR, INST_A, {});
    expect(mockCreateLink).not.toHaveBeenCalled();
    expect(res.paymentLinkId).toBeNull();
    expect(mockEmailSend.mock.calls[0][0].variables.paymentUrl).toBe('');
  });

  it('creation de lien qui leve : la relance part sans lien', async () => {
    mockPlan.mockResolvedValue([makePlan(INST_A)]);
    mockCreateLink.mockRejectedValue(new Error(`echec ${SECRET_URL}`));
    const res = await sendInstallmentReminder(TENANT, ACTOR, INST_A, {});
    expect(res.status).toBe('SENT');
    expect(res.paymentLinkId).toBeNull();
    expect(mockEmailSend.mock.calls[0][0].variables.paymentUrl).toBe('');
    expect(mockLogger.warn).toHaveBeenCalled();
    noSecretLeak();
  });

  it('canal demande non utilisable ignore', async () => {
    mockPlan.mockResolvedValue([makePlan(INST_A, { usableChannels: ['EMAIL'] })]);
    const res = await sendInstallmentReminder(TENANT, ACTOR, INST_A, { channels: ['EMAIL', 'WHATSAPP'] });
    expect(res.channels.map(c => c.channel)).toEqual(['EMAIL']);
    expect(mockWhatsappSend).not.toHaveBeenCalled();
  });

  it('aucun canal restant : 409 NOT_ELIGIBLE, rien envoye ni cree', async () => {
    mockPlan.mockResolvedValue([makePlan(INST_A, { usableChannels: ['EMAIL'] })]);
    const err: any = await sendInstallmentReminder(TENANT, ACTOR, INST_A, { channels: ['WHATSAPP'] }).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe(ErrorCode.RENTAL_REMINDER_NOT_ELIGIBLE);
    expect(err.data.reason).toBe('NO_CONTACT_CHANNEL');
    expect(mockCreateLink).not.toHaveBeenCalled();
    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(mockPrisma.rentalPaymentReminder.create).not.toHaveBeenCalled();
  });

  it('TOO_SOON : 409 RENTAL_REMINDER_TOO_SOON, level force ne contourne rien', async () => {
    mockPlan.mockResolvedValue([
      makePlan(INST_A, { item: { eligible: false, exclusions: ['TOO_SOON', 'NO_CONTACT_CHANNEL'] } })
    ]);
    const err: any = await sendInstallmentReminder(TENANT, ACTOR, INST_A, { level: 3 }).catch(e => e);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe(ErrorCode.RENTAL_REMINDER_TOO_SOON);
    expect(err.data).toEqual({
      installmentId: INST_A,
      reason: 'TOO_SOON',
      exclusions: ['TOO_SOON', 'NO_CONTACT_CHANNEL']
    });
    expect(mockEmailSend).not.toHaveBeenCalled();
  });

  it('autre exclusion : 409 NOT_ELIGIBLE avec la premiere raison', async () => {
    mockPlan.mockResolvedValue([makePlan(INST_A, { item: { eligible: false, exclusions: ['ALREADY_PAID'] } })]);
    const err: any = await sendInstallmentReminder(TENANT, ACTOR, INST_A, {}).catch(e => e);
    expect(err.code).toBe(ErrorCode.RENTAL_REMINDER_NOT_ELIGIBLE);
    expect(err.data.reason).toBe('ALREADY_PAID');
  });

  it('level du corps utilise sur une echeance eligible', async () => {
    mockPlan.mockResolvedValue([makePlan(INST_A)]);
    const res = await sendInstallmentReminder(TENANT, ACTOR, INST_A, { level: 2 });
    expect(res.level).toBe(2);
    expect(mockPrisma.rentalPaymentReminder.create.mock.calls[0][0].data.level).toBe(2);
  });

  it('echeance etrangere : NotFoundError propagee', async () => {
    mockPlan.mockRejectedValue(new NotFoundError('Échéance introuvable.'));
    await expect(sendInstallmentReminder(TENANT, ACTOR, INST_A, {})).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('sendInstallmentReminder concurrence', () => {
  it('deux appels simultanes : un seul envoi, le second recoit 409 TOO_SOON', async () => {
    mockPlan
      .mockResolvedValueOnce([makePlan(INST_A)])
      .mockResolvedValueOnce([makePlan(INST_A, { item: { eligible: false, exclusions: ['TOO_SOON'] } })]);
    const settled = await Promise.allSettled([
      sendInstallmentReminder(TENANT, ACTOR, INST_A, {}),
      sendInstallmentReminder(TENANT, ACTOR, INST_A, {})
    ]);
    expect(settled[0].status).toBe('fulfilled');
    expect(settled[1].status).toBe('rejected');
    expect((settled[1] as PromiseRejectedResult).reason.code).toBe(ErrorCode.RENTAL_REMINDER_TOO_SOON);
    expect(mockPlan).toHaveBeenCalledTimes(2);
    expect(mockPrisma.rentalPaymentReminder.create).toHaveBeenCalledTimes(2);
  });
});

describe('sendReminderBatch', () => {
  it('SKIPPED / SENT / FAILED dans l ordre, totaux, un seul planReminders', async () => {
    mockPlan.mockResolvedValue([
      makePlan(INST_A, { item: { eligible: false, exclusions: ['TOO_SOON'] } }),
      makePlan(INST_B, { usableChannels: ['EMAIL'] }),
      makePlan(INST_C, { usableChannels: ['EMAIL'] })
    ]);
    mockEmailSend.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const res = await sendReminderBatch(TENANT, ACTOR, { installmentIds: [INST_A, INST_B, INST_C] });

    expect(mockPlan).toHaveBeenCalledTimes(1);
    expect(mockPlan).toHaveBeenCalledWith(TENANT, [INST_A, INST_B, INST_C]);
    expect(res.results.map(r => [r.installmentId, r.status])).toEqual([
      [INST_A, 'SKIPPED'],
      [INST_B, 'SENT'],
      [INST_C, 'FAILED']
    ]);
    expect(res.results[0]).toMatchObject({
      reason: 'TOO_SOON',
      level: null,
      channels: [],
      paymentLinkId: null,
      failureCode: null
    });
    expect(res.totals).toEqual({ sent: 1, skipped: 1, failed: 1 });
    // Configs et numeros lus une seule fois pour tout le lot.
    expect(mockLoadConfigs).toHaveBeenCalledTimes(1);
    expect(mockPrisma.rentalReceivingNumber.findMany).toHaveBeenCalledTimes(1);
    noSecretLeak();
  });

  it('404 avant tout envoi', async () => {
    mockPlan.mockRejectedValue(new NotFoundError('Échéance introuvable.'));
    await expect(sendReminderBatch(TENANT, ACTOR, { installmentIds: [INST_A, INST_B] })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(mockCreateLink).not.toHaveBeenCalled();
    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(mockPrisma.rentalPaymentReminder.create).not.toHaveBeenCalled();
  });

  it('canal demande non utilisable : SKIPPED NO_CONTACT_CHANNEL sans exception', async () => {
    mockPlan.mockResolvedValue([makePlan(INST_A, { usableChannels: ['EMAIL'] })]);
    const res = await sendReminderBatch(TENANT, ACTOR, { installmentIds: [INST_A], channels: ['WHATSAPP'] });
    expect(res.results[0]).toMatchObject({ status: 'SKIPPED', reason: 'NO_CONTACT_CHANNEL' });
    expect(res.totals.skipped).toBe(1);
  });
});

describe('listReminders', () => {
  const row = {
    id: 'r1',
    tenant_id: TENANT,
    installment_id: INST_A,
    lease_id: 'lease-1',
    level: 1,
    channel: 'EMAIL',
    status: 'SENT',
    sent_by: ACTOR,
    sent_at: new Date('2026-10-01T10:00:00.000Z'),
    payment_link_id: 'link-1',
    failure_code: null,
    failure_message: 'ne doit pas sortir',
    installment: {
      period_year: 2026,
      period_month: 9,
      amount_rent: 150000,
      amount_service: 0,
      amount_other_fees: 0,
      penalty_amount: 0,
      amount_paid: 50000,
      payments: [],
      lease: { lease_number: 'B-001', primary_renter_client_id: 'client-1' }
    }
  };

  it('filtre par agence, pagine, borne les dates, expose le contexte sans failure_message', async () => {
    mockPrisma.rentalPaymentReminder.count.mockResolvedValue(41);
    mockPrisma.rentalPaymentReminder.findMany.mockResolvedValue([row]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: ACTOR, fullName: 'Agent Un', email: 'a@x.y' }]);
    mockPrisma.tenantClient.findMany.mockResolvedValue([
      { id: 'client-1', user: { email: 'loc@x.y', fullName: 'Compte Locataire' } }
    ]);
    mockPrisma.crmContact.findMany.mockResolvedValue([{ email: 'LOC@x.y', firstName: 'Awa', lastName: 'Traore' }]);

    const res = await listReminders(TENANT, {
      installmentId: INST_A,
      channel: 'EMAIL',
      status: 'SENT',
      level: 1,
      from: '2026-10-01',
      to: '2026-10-31',
      page: 2,
      pageSize: 500
    });

    const args = mockPrisma.rentalPaymentReminder.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      tenant_id: TENANT,
      installment_id: INST_A,
      channel: 'EMAIL',
      status: 'SENT',
      level: 1,
      sent_at: { gte: new Date('2026-10-01T00:00:00.000Z'), lt: new Date('2026-11-01T00:00:00.000Z') }
    });
    expect(args.orderBy[0]).toEqual({ sent_at: 'desc' });
    expect(args.take).toBe(100);
    expect(args.skip).toBe(100);
    expect(args.select.failure_message).toBeUndefined();
    expect(mockPrisma.rentalPaymentReminder.count.mock.calls[0][0].where.tenant_id).toBe(TENANT);

    expect(res).toMatchObject({ total: 41, page: 2, pageSize: 100 });
    expect(res.items).toEqual([
      {
        id: 'r1',
        tenant_id: TENANT,
        installment_id: INST_A,
        lease_id: 'lease-1',
        level: 1,
        channel: 'EMAIL',
        status: 'SENT',
        sent_by: ACTOR,
        sent_by_name: 'Agent Un',
        sent_at: '2026-10-01T10:00:00.000Z',
        payment_link_id: 'link-1',
        failure_code: null,
        leaseReference: 'B-001',
        tenantName: 'Awa Traore',
        periodYear: 2026,
        periodMonth: 9,
        amountDue: 100000
      }
    ]);
    expect(JSON.stringify(res)).not.toContain('failure_message');
    // Requetes groupees : une par type de donnee.
    expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.tenantClient.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.crmContact.findMany).toHaveBeenCalledTimes(1);
  });

  it('valeurs par defaut et nom de repli User.fullName ; auteur absent => null', async () => {
    mockPrisma.rentalPaymentReminder.count.mockResolvedValue(1);
    mockPrisma.rentalPaymentReminder.findMany.mockResolvedValue([{ ...row, sent_by: null }]);
    mockPrisma.tenantClient.findMany.mockResolvedValue([
      { id: 'client-1', user: { email: 'loc@x.y', fullName: 'Compte Locataire' } }
    ]);
    mockPrisma.crmContact.findMany.mockResolvedValue([]);

    const res = await listReminders(TENANT, {});
    const args = mockPrisma.rentalPaymentReminder.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ tenant_id: TENANT });
    expect(args.take).toBe(20);
    expect(args.skip).toBe(0);
    expect(res.items[0].sent_by_name).toBeNull();
    expect(res.items[0].tenantName).toBe('Compte Locataire');
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it('filtre d une autre agence : page vide', async () => {
    mockPrisma.rentalPaymentReminder.count.mockResolvedValue(0);
    mockPrisma.rentalPaymentReminder.findMany.mockResolvedValue([]);
    const res = await listReminders(TENANT, { leaseId: 'lease-etranger' });
    expect(res).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(mockPrisma.rentalPaymentReminder.findMany.mock.calls[0][0].where).toEqual({
      tenant_id: TENANT,
      lease_id: 'lease-etranger'
    });
  });
});

describe('listInstallmentReminders', () => {
  it('404 si l echeance n est pas de l agence', async () => {
    mockPrisma.rentalInstallment.findFirst.mockResolvedValue(null);
    await expect(listInstallmentReminders(TENANT, INST_A)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockPrisma.rentalInstallment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: INST_A, tenant_id: TENANT } })
    );
    expect(mockPrisma.rentalPaymentReminder.findMany).not.toHaveBeenCalled();
  });

  it('50 maximum, plus recente d abord, filtre par agence', async () => {
    mockPrisma.rentalInstallment.findFirst.mockResolvedValue({ id: INST_A });
    mockPrisma.rentalPaymentReminder.findMany.mockResolvedValue([]);
    const res = await listInstallmentReminders(TENANT, INST_A);
    expect(res).toEqual([]);
    const args = mockPrisma.rentalPaymentReminder.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ tenant_id: TENANT, installment_id: INST_A });
    expect(args.take).toBe(50);
    expect(args.orderBy[0]).toEqual({ sent_at: 'desc' });
  });
});
