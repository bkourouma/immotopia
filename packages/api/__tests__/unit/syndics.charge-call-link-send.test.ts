/* eslint-disable @typescript-eslint/no-explicit-any */
/** Spec 042, lot M6 — envoi du lien « Payer cet appel » au copropriétaire réel. */
import { createLinkDb } from './syndics.charge-call-link-fixtures';
import { IDS } from './syndics.online-payment-fixtures';

const db = createLinkDb();
const mockDb = db;
jest.mock('../../src/utils/database', () => ({ prisma: mockDb.prisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => mockDb.engine.logAuditEvent(...a),
  flushAuditEvents: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/syndics/charge-allocation', () => ({
  sumAllocationsByCall: (...a: any[]) => (mockDb.engine.sumAllocationsByCall as any)(...a),
  assertSyndicateOfTenant: (...a: any[]) => (mockDb.engine.assertSyndicateOfTenant as any)(...a),
  recordLotPaymentTx: (...a: any[]) => (mockDb.engine.recordLotPaymentTx as any)(...a)
}));
jest.mock('../../src/lib/syndics/charge-receipts', () => ({
  issueReceiptsForPaymentTx: jest.fn(),
  toDocumentRefs: jest.fn()
}));
jest.mock('../../src/lib/syndics/charge-receipt-delivery', () => ({ scheduleChargeDocumentDelivery: jest.fn() }));
jest.mock('../../src/lib/syndics/provider-invoice-accounting', () => ({ assertFiscalYearOpenTx: jest.fn() }));
jest.mock('../../src/lib/syndics/charge-schedule-tenant-gate', () => ({
  evaluateSchedulingGate: (...a: any[]) => (mockDb.engine.evaluateSchedulingGate as any)(...a)
}));
jest.mock('../../src/lib/syndics/notifications', () => ({
  resolveChargeCallRecipient: (lot: any) => (lot?.ownerContactId ? lot.owner : lot?.coownerId ? lot.coowner : null)
}));
jest.mock('../../src/lib/payment-gateway/crypto', () => ({ decryptSecret: (v: string) => v }));
jest.mock('../../src/lib/payment-gateway/paysecurehub', () => ({ gatewayClientForMode: () => mockDb.engine.client }));

const mockSendEmail = jest.fn(async (_a: any) => undefined);
jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: (a: any) => mockSendEmail(a) } }));
const mockEmailConfig = jest.fn();
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...a: any[]) => mockEmailConfig(...a)
}));
const mockWhatsappConfig = jest.fn();
jest.mock('../../src/services/whatsapp-notification-config-service', () => ({
  getWhatsappNotificationConfig: (...a: any[]) => mockWhatsappConfig(...a)
}));
const mockSendWhatsapp = jest.fn(async (_a: any) => true);
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: (a: any) => mockSendWhatsapp(a)
}));

import { sendChargeCallPaymentLink } from '../../src/lib/syndics/online-payment/charge-call-link-send';

const MANAGER = IDS.MANAGER;
const send = (chargeCallId: string = IDS.C1, syndicateId: string = IDS.S1) =>
  sendChargeCallPaymentLink(IDS.T1, syndicateId, chargeCallId, MANAGER);

beforeEach(() => {
  db.reset();
  mockSendEmail.mockResolvedValue(undefined);
  mockSendWhatsapp.mockResolvedValue(true);
  mockEmailConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  mockWhatsappConfig.mockResolvedValue({ enabled: true, bodyOverride: null });
  Object.assign(db.store.contacts[0], {
    consentEmail: true,
    consentWhatsapp: true,
    preferredContactChannel: null
  });
});

describe('sendChargeCallPaymentLink', () => {
  it('envoie par e-mail au copropriétaire réel : URL dans le corps seulement, audit sans jeton', async () => {
    db.addOwnerProfile();

    const result = await send();

    expect(result).toMatchObject({ sent: true, channel: 'EMAIL', amountDue: 30000, currency: 'XOF' });
    expect(result.linkId).toBe(db.links[0].id);
    const mail = mockSendEmail.mock.calls[0][0];
    expect(mail.to).toBe('awa@example.test');
    expect(mail.html).toContain('/payer-charges#');
    expect(mail.subject).not.toContain('payer-charges');
    expect(mockSendWhatsapp).not.toHaveBeenCalled();
    const audit = db.engine.logAuditEvent.mock.calls
      .map((c: any[]) => c[0])
      .find((e: any) => e.actionKey === 'SYNDIC_CHARGE_PAYMENT_LINK_SENT');
    expect(audit).toMatchObject({ entityId: IDS.C1, payload: { channel: 'EMAIL', linkId: db.links[0].id } });
    expect(JSON.stringify(audit)).not.toContain('payer-charges');
    expect(JSON.stringify(result)).not.toContain('payer-charges');
  });

  it('RECIPIENT_NOT_FOUND sans lien : lot sans copropriétaire, ou copropriétaire plus actuel', async () => {
    db.store.lots[0].ownerContactId = null;
    expect(await send()).toMatchObject({ sent: false, reason: 'RECIPIENT_NOT_FOUND' });

    db.store.lots[0].ownerContactId = IDS.AWA;
    db.addOwnerProfile({ contactId: 'autre', ownedSince: new Date('2020-01-01T00:00:00.000Z') });
    expect(await send()).toMatchObject({ sent: false, reason: 'RECIPIENT_NOT_FOUND' });
    expect(db.links).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('NO_ELIGIBLE_CHANNEL et EVENT_DISABLED : aucun lien conservé', async () => {
    Object.assign(db.store.contacts[0], { consentEmail: false, consentWhatsapp: false });
    expect(await send()).toMatchObject({ sent: false, reason: 'NO_ELIGIBLE_CHANNEL' });

    Object.assign(db.store.contacts[0], { consentEmail: true });
    mockEmailConfig.mockResolvedValue({ enabled: false });
    expect(await send()).toMatchObject({ sent: false, reason: 'EVENT_DISABLED' });
    expect(db.links).toHaveLength(0);
  });

  it('SEND_FAILED : le lien créé est révoqué', async () => {
    mockSendEmail.mockRejectedValue(new Error('smtp'));
    mockWhatsappConfig.mockResolvedValue({ enabled: false });

    expect(await send()).toMatchObject({ sent: false, reason: 'SEND_FAILED' });
    expect(db.links).toHaveLength(1);
    expect(db.links[0].revokedAt).toBeInstanceOf(Date);
  });

  it('404 pour un appel d’une autre agence ou copropriété, 400 pour un appel soldé', async () => {
    await expect(send(IDS.CB)).rejects.toMatchObject({ statusCode: 404 });
    await expect(send(IDS.C4)).rejects.toMatchObject({ statusCode: 404 });
    db.store.allocations.push({ id: 'a', paymentId: 'p', chargeCallId: IDS.C1, amount: 30000 });
    await expect(send()).rejects.toMatchObject({ statusCode: 400, code: 'ONLINE_PAYMENT_NOTHING_DUE' });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
