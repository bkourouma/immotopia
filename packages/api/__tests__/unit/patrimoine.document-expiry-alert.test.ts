/**
 * `lib/patrimoine/notifications.ts` — `alertExpiringDocuments`.
 *
 * Mock à la frontière `utils/database`, comme l'exige `.claude/rules/testing.md`
 * pour un test de service ; les autres dépendances (config des notifications,
 * envoi d'e-mail, envoi WhatsApp) sont aussi mockées, chaque factory couvrant
 * tous les exports utilisés par le fichier testé (AGENTS.md).
 */

const propertyDocumentFindMany = jest.fn();
const propertyDocumentUpdateMany = jest.fn();
const propertyOwnershipShareFindMany = jest.fn();
const tenantClientFindFirst = jest.fn();
const tenantClientFindMany = jest.fn();
const crmContactFindMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    propertyDocument: {
      findMany: (...a: any[]) => propertyDocumentFindMany(...a),
      updateMany: (...a: any[]) => propertyDocumentUpdateMany(...a)
    },
    propertyOwnershipShare: {
      findMany: (...a: any[]) => propertyOwnershipShareFindMany(...a)
    },
    tenantClient: {
      findFirst: (...a: any[]) => tenantClientFindFirst(...a),
      findMany: (...a: any[]) => tenantClientFindMany(...a)
    },
    crmContact: {
      findMany: (...a: any[]) => crmContactFindMany(...a)
    }
  }
}));

const getEmailNotificationConfig = jest.fn();
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...a: any[]) => getEmailNotificationConfig(...a)
}));

// Canal WhatsApp des alertes proprietaire (lot A3) : coupe par defaut dans ces
// tests, centres sur le canal e-mail ; le routage par canal a son propre test
// (`patrimoine.notification-channels.test.ts`).
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

import { alertExpiringDocuments } from '../../src/lib/patrimoine/notifications';

const TENANT = 'tenant-1';
const NOW = new Date('2026-09-28T00:00:00.000Z');

function baseDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    propertyId: 'prop-1',
    documentType: 'INSURANCE',
    fileName: 'Assurance habitation',
    expirationDate: new Date('2026-10-15T00:00:00.000Z'),
    property: { internalReference: 'REF-1', title: 'Villa Koumassi', ownerUserId: null },
    ...overrides
  };
}

/** Un seul propriétaire, consentant, relié au bien par une part d'indivision. */
function mockEligibleOwner(overrides: Partial<{ consentEmail: boolean | null; email: string | null }> = {}) {
  propertyOwnershipShareFindMany.mockResolvedValue([{ ownerClientId: 'client-1' }]);
  tenantClientFindMany.mockResolvedValue([{ id: 'client-1', details: { crmContactId: 'contact-1' } }]);
  crmContactFindMany.mockResolvedValue([
    {
      id: 'contact-1',
      email: overrides.email !== undefined ? overrides.email : 'owner@example.com',
      firstName: 'Awa',
      lastName: 'Koné',
      consentEmail: overrides.consentEmail !== undefined ? overrides.consentEmail : true
    }
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  getWhatsappNotificationConfig.mockResolvedValue({ enabled: false });
  getEmailNotificationConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  propertyDocumentUpdateMany.mockResolvedValue({ count: 1 });
  sendEmail.mockResolvedValue(undefined);
  tenantClientFindFirst.mockResolvedValue(null);
  propertyOwnershipShareFindMany.mockResolvedValue([]);
  tenantClientFindMany.mockResolvedValue([]);
  crmContactFindMany.mockResolvedValue([]);
});

describe('alertExpiringDocuments — sélection', () => {
  it('interroge propertyDocument avec tenantId, warningSentAt: null et la fenêtre [now, now+30j]', async () => {
    propertyDocumentFindMany.mockResolvedValue([]);

    const result = await alertExpiringDocuments(TENANT, { now: NOW });

    expect(propertyDocumentFindMany).toHaveBeenCalledTimes(1);
    const call = propertyDocumentFindMany.mock.calls[0][0];
    expect(call.where.tenantId).toBe(TENANT);
    expect(call.where.warningSentAt).toBeNull();
    expect(call.where.expirationDate.gte).toEqual(NOW);
    expect(call.where.expirationDate.lte).toEqual(new Date('2026-10-28T00:00:00.000Z'));
    expect(result).toEqual({ matched: 0, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 });
  });

  it("ne requête aucun document, et n'envoie rien, quand la notification est désactivée", async () => {
    getEmailNotificationConfig.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });

    const result = await alertExpiringDocuments(TENANT, { now: NOW });

    expect(propertyDocumentFindMany).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ matched: 0, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 });
  });
});

describe('alertExpiringDocuments — envoi et échappement HTML', () => {
  it('envoie au propriétaire consentant ; un fileName malveillant ressort échappé dans le HTML, brut dans le sujet', async () => {
    const XSS_NAME = '<script>alert(1)</script>';
    propertyDocumentFindMany.mockResolvedValue([baseDoc({ fileName: XSS_NAME })]);
    mockEligibleOwner();

    const result = await alertExpiringDocuments(TENANT, { now: NOW });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const emailArgs = sendEmail.mock.calls[0][0];
    expect(emailArgs.to).toBe('owner@example.com');
    expect(emailArgs.tenantId).toBe(TENANT);
    expect(emailArgs.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(emailArgs.html).not.toContain(XSS_NAME);
    // Le sujet part en texte brut, jamais échappé.
    expect(emailArgs.subject).toContain(XSS_NAME);
    expect(result.sent).toBe(1);
    expect(result.matched).toBe(1);
  });
});

describe('alertExpiringDocuments — anti-doublon', () => {
  it("n'envoie rien quand la réservation (updateMany) renvoie count: 0 (déjà pris par un autre passage)", async () => {
    propertyDocumentFindMany.mockResolvedValue([baseDoc()]);
    mockEligibleOwner();
    propertyDocumentUpdateMany.mockResolvedValue({ count: 0 });

    const result = await alertExpiringDocuments(TENANT, { now: NOW });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.skippedAlreadySent).toBe(1);
    expect(result.sent).toBe(0);
  });

  it('réserve le document (warningSentAt: null dans le where) avant un envoi réussi', async () => {
    propertyDocumentFindMany.mockResolvedValue([baseDoc()]);
    mockEligibleOwner();

    await alertExpiringDocuments(TENANT, { now: NOW });

    expect(propertyDocumentUpdateMany).toHaveBeenCalledWith({
      where: { id: 'doc-1', tenantId: TENANT, warningSentAt: null },
      data: { warningSentAt: NOW }
    });
  });

  it('remet warningSentAt à null quand tous les envois échouent, pour un nouvel essai le lendemain', async () => {
    propertyDocumentFindMany.mockResolvedValue([baseDoc()]);
    mockEligibleOwner();
    sendEmail.mockRejectedValue(new Error('SMTP indisponible'));

    const result = await alertExpiringDocuments(TENANT, { now: NOW });

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
    expect(propertyDocumentUpdateMany).toHaveBeenLastCalledWith({
      where: { id: 'doc-1', tenantId: TENANT },
      data: { warningSentAt: null }
    });
  });
});

describe('alertExpiringDocuments — consentement du propriétaire', () => {
  it("n'envoie rien et ne marque rien quand le contact n'a pas consenti (consentEmail: false)", async () => {
    propertyDocumentFindMany.mockResolvedValue([baseDoc()]);
    mockEligibleOwner({ consentEmail: false });

    const result = await alertExpiringDocuments(TENANT, { now: NOW });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(propertyDocumentUpdateMany).not.toHaveBeenCalled();
    expect(result.skippedNoRecipient).toBe(1);
  });

  it("n'envoie rien quand le consentement n'est pas renseigné (consentEmail: null)", async () => {
    propertyDocumentFindMany.mockResolvedValue([baseDoc()]);
    mockEligibleOwner({ consentEmail: null });

    const result = await alertExpiringDocuments(TENANT, { now: NOW });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.skippedNoRecipient).toBe(1);
  });

  it("n'envoie rien quand le TenantClient n'a pas de details.crmContactId", async () => {
    propertyDocumentFindMany.mockResolvedValue([baseDoc()]);
    propertyOwnershipShareFindMany.mockResolvedValue([{ ownerClientId: 'client-1' }]);
    tenantClientFindMany.mockResolvedValue([{ id: 'client-1', details: {} }]);

    const result = await alertExpiringDocuments(TENANT, { now: NOW });

    expect(crmContactFindMany).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.skippedNoRecipient).toBe(1);
  });
});
