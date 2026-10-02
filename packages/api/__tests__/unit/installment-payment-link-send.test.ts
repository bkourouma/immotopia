/**
 * `lib/payment-gateway/installment-payment-link-send.ts` — envoi du lien de
 * paiement d'un loyer au locataire (lot C5, spec 039).
 *
 * Mocks aux frontières : `utils/database`, `installment-payment-link` (création
 * du lien), `lib/secure-links` (révocation), config des notifications, envoi
 * d'e-mail et WhatsApp. Aucun message réel, aucun jeton réel.
 */

const installmentFindFirst = jest.fn();
const tenantClientFindFirst = jest.fn();
const crmContactFindFirst = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalInstallment: { findFirst: (...a: any[]) => installmentFindFirst(...a) },
    tenantClient: { findFirst: (...a: any[]) => tenantClientFindFirst(...a) },
    crmContact: { findFirst: (...a: any[]) => crmContactFindFirst(...a) }
  }
}));

const loggerInfo = jest.fn();
const loggerWarn = jest.fn();
const loggerError = jest.fn();
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: (...a: any[]) => loggerInfo(...a),
    warn: (...a: any[]) => loggerWarn(...a),
    error: (...a: any[]) => loggerError(...a),
    debug: jest.fn()
  }
}));

const createInstallmentPaymentLink = jest.fn();
jest.mock('../../src/lib/payment-gateway/installment-payment-link', () => ({
  INSTALLMENT_OBJECT_TYPE: 'RentalInstallment',
  createInstallmentPaymentLink: (...a: any[]) => createInstallmentPaymentLink(...a)
}));

const revokeSecureLink = jest.fn();
jest.mock('../../src/lib/secure-links', () => ({
  revokeSecureLink: (...a: any[]) => revokeSecureLink(...a)
}));

const getEmailNotificationConfig = jest.fn();
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...a: any[]) => getEmailNotificationConfig(...a)
}));
const getWhatsappNotificationConfig = jest.fn();
jest.mock('../../src/services/whatsapp-notification-config-service', () => ({
  getWhatsappNotificationConfig: (...a: any[]) => getWhatsappNotificationConfig(...a)
}));
const sendEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...a: any[]) => sendEmail(...a) }
}));
const sendWhatsappNotification = jest.fn();
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: (...a: any[]) => sendWhatsappNotification(...a)
}));
const logAuditEvent = jest.fn();
const flushAuditEvents = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => logAuditEvent(...a),
  flushAuditEvents: (...a: any[]) => flushAuditEvents(...a)
}));

import { AuditActionKey } from '../../src/types/audit-types';
import { NotFoundError } from '../../src/middleware/error-middleware';
import { sendInstallmentPaymentLink } from '../../src/lib/payment-gateway/installment-payment-link-send';

const TENANT = 'tenant-1';
const INSTALLMENT = '11111111-1111-4111-8111-111111111111';
const SECRET_TOKEN = 'tok_SECRET_ABCDEF123456';
const PAY_URL = `https://app.test/payer#${SECRET_TOKEN}`;

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    email: 'locataire@example.com',
    consentEmail: true,
    whatsappNumber: '+2250700000000',
    phonePrimary: null,
    consentWhatsapp: true,
    preferredContactChannel: null,
    firstName: 'Moussa',
    lastName: 'Traoré',
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  installmentFindFirst.mockResolvedValue({ id: INSTALLMENT, lease: { primary_renter_client_id: 'client-1' } });
  tenantClientFindFirst.mockResolvedValue({ user: { email: 'Locataire@Example.com' } });
  crmContactFindFirst.mockResolvedValue(contactRow());
  getEmailNotificationConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  getWhatsappNotificationConfig.mockResolvedValue({
    enabled: true,
    bodyOverride: null,
    contentSid: null,
    contentVariablesJson: null
  });
  createInstallmentPaymentLink.mockResolvedValue({
    link: { id: 'link-1', token: SECRET_TOKEN, url: PAY_URL, expiresAt: new Date('2026-10-14T00:00:00.000Z') },
    context: {
      installmentId: INSTALLMENT,
      leaseId: 'lease-1',
      periodYear: 2026,
      periodMonth: 10,
      dueDate: new Date('2026-10-05T00:00:00.000Z'),
      amountDue: 150000,
      currency: 'FCFA',
      renterClientId: 'client-1',
      agencyName: 'Agence Koumassi'
    }
  });
  revokeSecureLink.mockResolvedValue(undefined);
  sendEmail.mockResolvedValue(undefined);
  sendWhatsappNotification.mockResolvedValue(true);
  flushAuditEvents.mockResolvedValue(0);
});

function allLoggerCalls(): string {
  return JSON.stringify([...loggerInfo.mock.calls, ...loggerWarn.mock.calls, ...loggerError.mock.calls]);
}

describe('sendInstallmentPaymentLink', () => {
  it('échéance d’une autre agence ou inexistante : NotFoundError, requête filtrée par tenant_id, aucun lien', async () => {
    installmentFindFirst.mockResolvedValue(null);

    await expect(sendInstallmentPaymentLink('autre-agence', INSTALLMENT, 'user-1')).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(installmentFindFirst.mock.calls[0][0].where).toEqual({ id: INSTALLMENT, tenant_id: 'autre-agence' });
    expect(createInstallmentPaymentLink).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('rapproche la fiche CRM par l’e-mail du compte, dans l’agence, par select explicite', async () => {
    await sendInstallmentPaymentLink(TENANT, INSTALLMENT, 'user-1');

    const clientQuery = tenantClientFindFirst.mock.calls[0][0];
    expect(clientQuery.where).toEqual({ id: 'client-1', tenantId: TENANT });
    expect(clientQuery.select).toEqual({ user: { select: { email: true } } });
    const contactQuery = crmContactFindFirst.mock.calls[0][0];
    expect(contactQuery.where).toEqual({
      tenantId: TENANT,
      email: { equals: 'Locataire@Example.com', mode: 'insensitive' }
    });
    expect(contactQuery.select).toBeDefined();
    expect(contactQuery.include).toBeUndefined();
  });

  it('fiche CRM introuvable : RENTER_CONTACT_NOT_FOUND, aucun lien', async () => {
    crmContactFindFirst.mockResolvedValue(null);

    const result = await sendInstallmentPaymentLink(TENANT, INSTALLMENT, 'user-1');

    expect(result).toEqual({ sent: false, channel: null, reason: 'RENTER_CONTACT_NOT_FOUND' });
    expect(createInstallmentPaymentLink).not.toHaveBeenCalled();
  });

  it('compte sans e-mail : RENTER_CONTACT_NOT_FOUND sans interroger le CRM', async () => {
    tenantClientFindFirst.mockResolvedValue({ user: { email: '  ' } });

    const result = await sendInstallmentPaymentLink(TENANT, INSTALLMENT, 'user-1');

    expect(result.reason).toBe('RENTER_CONTACT_NOT_FOUND');
    expect(crmContactFindFirst).not.toHaveBeenCalled();
  });

  it('canal par défaut : un seul e-mail, URL dans le corps et jamais dans le sujet', async () => {
    const result = await sendInstallmentPaymentLink(TENANT, INSTALLMENT, 'user-9', { ttlDays: 5 });

    expect(result).toEqual({
      sent: true,
      channel: 'EMAIL',
      linkId: 'link-1',
      expiresAt: '2026-10-14T00:00:00.000Z',
      amountDue: 150000,
      currency: 'FCFA'
    });
    expect(createInstallmentPaymentLink).toHaveBeenCalledWith(TENANT, INSTALLMENT, 'user-9', { ttlDays: 5 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('locataire@example.com');
    expect(mail.html).toContain(PAY_URL);
    expect(mail.html).toContain('Moussa Traoré');
    expect(mail.html).toContain('10/2026');
    expect(mail.subject).not.toContain(SECRET_TOKEN);
    expect(mail.subject).not.toContain('payer');
    expect(mail.subject).toContain('10/2026');
    expect(sendWhatsappNotification).not.toHaveBeenCalled();
  });

  it('canal préféré WhatsApp (consentement + numéro + clé activée) : un seul message WhatsApp avec l’URL', async () => {
    crmContactFindFirst.mockResolvedValue(contactRow({ preferredContactChannel: 'WHATSAPP' }));

    const result = await sendInstallmentPaymentLink(TENANT, INSTALLMENT, null);

    expect(result.channel).toBe('WHATSAPP');
    expect(sendWhatsappNotification).toHaveBeenCalledTimes(1);
    const call = sendWhatsappNotification.mock.calls[0][0];
    expect(call).toMatchObject({
      tenantId: TENANT,
      notificationKey: 'RENTER_PAYMENT_LINK_SENT',
      contactId: 'contact-1'
    });
    expect(call.variables).toMatchObject({
      paymentUrl: PAY_URL,
      renterName: 'Moussa Traoré',
      agencyName: 'Agence Koumassi',
      period: '10/2026'
    });
    expect(call.to).toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('WhatsApp désactivé par l’agence (opt-in) : repli sur l’e-mail', async () => {
    crmContactFindFirst.mockResolvedValue(contactRow({ preferredContactChannel: 'WHATSAPP' }));
    getWhatsappNotificationConfig.mockResolvedValue({ enabled: false });

    const result = await sendInstallmentPaymentLink(TENANT, INSTALLMENT, null);

    expect(result.channel).toBe('EMAIL');
    expect(sendWhatsappNotification).not.toHaveBeenCalled();
  });

  it('aucun canal éligible : NO_ELIGIBLE_CHANNEL et AUCUN lien créé', async () => {
    crmContactFindFirst.mockResolvedValue(contactRow({ consentEmail: false, consentWhatsapp: false }));

    const result = await sendInstallmentPaymentLink(TENANT, INSTALLMENT, 'user-1');

    expect(result).toEqual({ sent: false, channel: null, reason: 'NO_ELIGIBLE_CHANNEL' });
    expect(createInstallmentPaymentLink).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendWhatsappNotification).not.toHaveBeenCalled();
  });

  it('événement désactivé sur les deux canaux : EVENT_DISABLED et aucun lien créé', async () => {
    getEmailNotificationConfig.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });
    getWhatsappNotificationConfig.mockResolvedValue({ enabled: false });

    const result = await sendInstallmentPaymentLink(TENANT, INSTALLMENT, 'user-1');

    expect(result).toEqual({ sent: false, channel: null, reason: 'EVENT_DISABLED' });
    expect(createInstallmentPaymentLink).not.toHaveBeenCalled();
  });

  it('tous les envois échouent : SEND_FAILED, lien révoqué (sur cette échéance), aucun audit', async () => {
    sendEmail.mockRejectedValue(new Error('SMTP down'));
    sendWhatsappNotification.mockResolvedValue(false);

    const result = await sendInstallmentPaymentLink(TENANT, INSTALLMENT, 'user-1');

    expect(result).toEqual({ sent: false, channel: null, reason: 'SEND_FAILED' });
    expect(revokeSecureLink).toHaveBeenCalledWith(TENANT, 'link-1', 'user-1', {
      objectType: 'RentalInstallment',
      objectId: INSTALLMENT
    });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('échec de la révocation : SEND_FAILED quand même, journalisé sans URL ni jeton', async () => {
    sendEmail.mockRejectedValue(new Error('SMTP down'));
    sendWhatsappNotification.mockResolvedValue(false);
    revokeSecureLink.mockRejectedValue(new Error('db down'));

    const result = await sendInstallmentPaymentLink(TENANT, INSTALLMENT, null);

    expect(result.reason).toBe('SEND_FAILED');
    expect(revokeSecureLink.mock.calls[0][2]).toBe('system');
    expect(loggerError).toHaveBeenCalled();
    expect(allLoggerCalls()).not.toContain(SECRET_TOKEN);
  });

  it('échéance non payable : l’erreur du service de création remonte, rien n’est envoyé', async () => {
    createInstallmentPaymentLink.mockRejectedValue(new Error('Échéance soldée'));

    await expect(sendInstallmentPaymentLink(TENANT, INSTALLMENT, 'user-1')).rejects.toThrow('Échéance soldée');
    expect(sendEmail).not.toHaveBeenCalled();
    expect(revokeSecureLink).not.toHaveBeenCalled();
  });

  it('audit RENTAL_PAYMENT_LINK_SENT : canal, linkId, installmentId ; jamais jeton ni URL ; journaux propres', async () => {
    await sendInstallmentPaymentLink(TENANT, INSTALLMENT, 'user-1');

    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    const entry = logAuditEvent.mock.calls[0][0];
    expect(entry).toMatchObject({
      actorUserId: 'user-1',
      tenantId: TENANT,
      actionKey: AuditActionKey.RENTAL_PAYMENT_LINK_SENT,
      entityType: 'RentalInstallment',
      entityId: INSTALLMENT,
      payload: { installmentId: INSTALLMENT, channel: 'EMAIL', linkId: 'link-1' }
    });
    expect(JSON.stringify(entry)).not.toContain(SECRET_TOKEN);
    expect(JSON.stringify(entry)).not.toContain('payer#');
    expect(flushAuditEvents).toHaveBeenCalled();
    expect(allLoggerCalls()).not.toContain(SECRET_TOKEN);
    expect(allLoggerCalls()).not.toContain(PAY_URL);
  });

  it('le résultat ne contient ni URL ni jeton', async () => {
    const result = await sendInstallmentPaymentLink(TENANT, INSTALLMENT, 'user-1');

    expect(JSON.stringify(result)).not.toContain(SECRET_TOKEN);
    expect(JSON.stringify(result)).not.toContain('payer#');
  });
});
