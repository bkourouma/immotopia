/**
 * `lib/patrimoine/notifications.ts` — `sendOwnerMonthlyReport` (lot A3).
 *
 * Mock à la frontière `utils/database` ; `lib/secure-links`, la config des
 * notifications, l'envoi d'e-mail et l'envoi WhatsApp sont mockés : aucun
 * message réel, aucun jeton réel.
 */

const ownerStatementFindFirst = jest.fn();
const auditLogFindMany = jest.fn();
const tenantFindUnique = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    ownerStatement: { findFirst: (...a: any[]) => ownerStatementFindFirst(...a) },
    auditLog: { findMany: (...a: any[]) => auditLogFindMany(...a) },
    tenant: { findUnique: (...a: any[]) => tenantFindUnique(...a) }
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

const createSecureLink = jest.fn();
const revokeSecureLink = jest.fn();
jest.mock('../../src/lib/secure-links', () => ({
  createSecureLink: (...a: any[]) => createSecureLink(...a),
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
import { sendOwnerMonthlyReport } from '../../src/lib/patrimoine/notifications';

const TENANT = 'tenant-1';
const STATEMENT = 'statement-1';
const SECRET_TOKEN = 'tok_SECRET_ABCDEF123456';
const REPORT_URL = `https://app.test/r/${SECRET_TOKEN}`;

function statementRow(ownerOverrides: Record<string, unknown> = {}) {
  return {
    id: STATEMENT,
    period: '2026-09',
    owner: {
      id: 'contact-1',
      email: 'owner@example.com',
      consentEmail: true,
      whatsappNumber: '+2250700000000',
      phonePrimary: null,
      consentWhatsapp: true,
      preferredContactChannel: null,
      firstName: 'Awa',
      lastName: 'Koné',
      ...ownerOverrides
    }
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  ownerStatementFindFirst.mockResolvedValue(statementRow());
  auditLogFindMany.mockResolvedValue([]);
  tenantFindUnique.mockResolvedValue({ name: 'Agence Koumassi' });
  getEmailNotificationConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  getWhatsappNotificationConfig.mockResolvedValue({
    enabled: true,
    bodyOverride: null,
    contentSid: null,
    contentVariablesJson: null
  });
  createSecureLink.mockResolvedValue({
    id: 'link-1',
    token: SECRET_TOKEN,
    expiresAt: new Date('2026-10-14T00:00:00.000Z'),
    url: REPORT_URL
  });
  revokeSecureLink.mockResolvedValue(undefined);
  sendEmail.mockResolvedValue(undefined);
  sendWhatsappNotification.mockResolvedValue(true);
  flushAuditEvents.mockResolvedValue(0);
});

function allLoggerCalls(): string {
  return JSON.stringify([...loggerInfo.mock.calls, ...loggerWarn.mock.calls, ...loggerError.mock.calls]);
}

describe('sendOwnerMonthlyReport', () => {
  it('relevé d’une autre agence ou inexistant : STATEMENT_NOT_FOUND, requête filtrée par tenantId, aucun lien', async () => {
    ownerStatementFindFirst.mockResolvedValue(null);

    const result = await sendOwnerMonthlyReport(STATEMENT, 'autre-agence');

    expect(result).toEqual({ sent: false, channel: null, reason: 'STATEMENT_NOT_FOUND' });
    expect(ownerStatementFindFirst.mock.calls[0][0].where).toEqual({ id: STATEMENT, tenantId: 'autre-agence' });
    expect(createSecureLink).not.toHaveBeenCalled();
  });

  it('crée le lien avec les bons paramètres et met l’URL dans l’e-mail (canal par défaut)', async () => {
    const result = await sendOwnerMonthlyReport(STATEMENT, TENANT, { actorUserId: 'user-9' });

    expect(result).toEqual({ sent: true, channel: 'EMAIL' });
    expect(createSecureLink).toHaveBeenCalledWith({
      tenantId: TENANT,
      scope: 'OWNER_MONTHLY_REPORT',
      objectType: 'OwnerStatement',
      objectId: STATEMENT,
      createdByUserId: 'user-9'
    });
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('owner@example.com');
    expect(mail.html).toContain(REPORT_URL);
    expect(mail.html).toContain('Awa Koné');
    expect(mail.html).toContain('2026-09');
    expect(mail.subject).toContain('2026-09');
    expect(sendWhatsappNotification).not.toHaveBeenCalled();
  });

  it('createdByUserId vaut null sans acteur (job)', async () => {
    await sendOwnerMonthlyReport(STATEMENT, TENANT);
    expect(createSecureLink.mock.calls[0][0].createdByUserId).toBeNull();
  });

  it('canal préféré WhatsApp : l’URL part dans les variables WhatsApp, avec contactId', async () => {
    ownerStatementFindFirst.mockResolvedValue(statementRow({ preferredContactChannel: 'WHATSAPP' }));

    const result = await sendOwnerMonthlyReport(STATEMENT, TENANT);

    expect(result).toEqual({ sent: true, channel: 'WHATSAPP' });
    const call = sendWhatsappNotification.mock.calls[0][0];
    expect(call).toMatchObject({
      tenantId: TENANT,
      notificationKey: 'OWNER_MONTHLY_REPORT_SENT',
      contactId: 'contact-1'
    });
    expect(call.variables).toMatchObject({
      reportUrl: REPORT_URL,
      ownerName: 'Awa Koné',
      period: '2026-09',
      agencyName: 'Agence Koumassi'
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('aucun canal éligible : NO_ELIGIBLE_CHANNEL et AUCUN lien créé', async () => {
    ownerStatementFindFirst.mockResolvedValue(statementRow({ consentEmail: false, consentWhatsapp: false }));

    const result = await sendOwnerMonthlyReport(STATEMENT, TENANT);

    expect(result).toEqual({ sent: false, channel: null, reason: 'NO_ELIGIBLE_CHANNEL' });
    expect(createSecureLink).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('événement désactivé sur les deux canaux : EVENT_DISABLED et aucun lien créé', async () => {
    getEmailNotificationConfig.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });
    getWhatsappNotificationConfig.mockResolvedValue({ enabled: false });

    const result = await sendOwnerMonthlyReport(STATEMENT, TENANT);

    expect(result).toEqual({ sent: false, channel: null, reason: 'EVENT_DISABLED' });
    expect(createSecureLink).not.toHaveBeenCalled();
  });

  it('e-mail désactivé : repli sur WhatsApp', async () => {
    getEmailNotificationConfig.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });

    const result = await sendOwnerMonthlyReport(STATEMENT, TENANT);

    expect(result).toEqual({ sent: true, channel: 'WHATSAPP' });
  });

  it('échec de tous les canaux : SEND_FAILED (et non NO_ELIGIBLE_CHANNEL), le lien créé est révoqué, rien n’est marqué envoyé', async () => {
    sendEmail.mockRejectedValue(new Error('SMTP indisponible'));
    sendWhatsappNotification.mockResolvedValue(false);

    const result = await sendOwnerMonthlyReport(STATEMENT, TENANT, { actorUserId: 'user-9' });

    expect(result).toEqual({ sent: false, channel: null, reason: 'SEND_FAILED' });
    expect(revokeSecureLink).toHaveBeenCalledWith(TENANT, 'link-1', 'user-9');
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('une révocation en échec est journalisée sans masquer le résultat', async () => {
    sendEmail.mockRejectedValue(new Error('SMTP indisponible'));
    sendWhatsappNotification.mockResolvedValue(false);
    revokeSecureLink.mockRejectedValue(new Error('base indisponible'));

    const result = await sendOwnerMonthlyReport(STATEMENT, TENANT);

    expect(result.sent).toBe(false);
    expect(loggerError).toHaveBeenCalled();
  });

  it('anti-doublon : un relevé déjà envoyé n’est pas renvoyé, aucun lien créé', async () => {
    auditLogFindMany.mockResolvedValue([{ entityId: STATEMENT }]);

    const result = await sendOwnerMonthlyReport(STATEMENT, TENANT);

    expect(result).toEqual({ sent: false, channel: null, reason: 'ALREADY_SENT' });
    expect(auditLogFindMany.mock.calls[0][0].where).toMatchObject({
      tenantId: TENANT,
      actionKey: AuditActionKey.PATRIMOINE_OWNER_MONTHLY_REPORT_SENT,
      entityType: 'OwnerStatement'
    });
    expect(createSecureLink).not.toHaveBeenCalled();
  });

  it('envoi manuel (force) : ignore l’anti-doublon', async () => {
    auditLogFindMany.mockResolvedValue([{ entityId: STATEMENT }]);

    const result = await sendOwnerMonthlyReport(STATEMENT, TENANT, { force: true });

    expect(result.sent).toBe(true);
    expect(auditLogFindMany).not.toHaveBeenCalled();
  });

  it('succès : pose la marque anti-doublon (clé = id du relevé) sans jeton ni URL', async () => {
    await sendOwnerMonthlyReport(STATEMENT, TENANT, { actorUserId: 'user-9' });

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        actorUserId: 'user-9',
        actionKey: AuditActionKey.PATRIMOINE_OWNER_MONTHLY_REPORT_SENT,
        entityType: 'OwnerStatement',
        entityId: STATEMENT,
        payload: expect.objectContaining({ statementId: STATEMENT, channel: 'EMAIL', linkId: 'link-1' })
      })
    );
    expect(JSON.stringify(logAuditEvent.mock.calls)).not.toContain(SECRET_TOKEN);
    expect(flushAuditEvents).toHaveBeenCalled();
  });

  it('le jeton ne figure dans aucun appel du logger (succès comme échec)', async () => {
    await sendOwnerMonthlyReport(STATEMENT, TENANT);
    sendEmail.mockRejectedValue(new Error('SMTP indisponible'));
    sendWhatsappNotification.mockResolvedValue(false);
    await sendOwnerMonthlyReport(STATEMENT, TENANT, { force: true });

    expect(allLoggerCalls()).not.toContain(SECRET_TOKEN);
  });
});
