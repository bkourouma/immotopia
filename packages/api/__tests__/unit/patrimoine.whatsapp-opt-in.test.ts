/**
 * Clés WhatsApp des alertes propriétaire (lot A3) : OPT-IN.
 *
 * Contrairement aux autres tests d'alertes, le service de configuration
 * WhatsApp est ICI le vrai : seul `utils/database` est mocké (aucune ligne de
 * configuration par défaut). `consentWhatsapp` vaut true par défaut en base :
 * sans opt-in explicite de l'agence, rien ne doit partir en WhatsApp.
 */

const rentalLeaseFindMany = jest.fn();
const propertyDocumentFindMany = jest.fn();
const propertyDocumentUpdateMany = jest.fn();
const markerFindMany = jest.fn();
const markerCreate = jest.fn();
const tenantFindUnique = jest.fn();
const propertyOwnershipShareFindMany = jest.fn();
const tenantClientFindFirst = jest.fn();
const tenantClientFindMany = jest.fn();
const crmContactFindMany = jest.fn();
const whatsappConfigFindUnique = jest.fn();
const whatsappConfigFindMany = jest.fn();
const whatsappConfigUpsert = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalLease: { findMany: (...a: any[]) => rentalLeaseFindMany(...a) },
    propertyDocument: {
      findMany: (...a: any[]) => propertyDocumentFindMany(...a),
      updateMany: (...a: any[]) => propertyDocumentUpdateMany(...a)
    },
    notificationMarker: {
      findMany: (...a: any[]) => markerFindMany(...a),
      create: (...a: any[]) => markerCreate(...a)
    },
    tenant: { findUnique: (...a: any[]) => tenantFindUnique(...a) },
    propertyOwnershipShare: { findMany: (...a: any[]) => propertyOwnershipShareFindMany(...a) },
    tenantClient: {
      findFirst: (...a: any[]) => tenantClientFindFirst(...a),
      findMany: (...a: any[]) => tenantClientFindMany(...a)
    },
    crmContact: { findMany: (...a: any[]) => crmContactFindMany(...a) },
    whatsappNotificationConfig: {
      findUnique: (...a: any[]) => whatsappConfigFindUnique(...a),
      findMany: (...a: any[]) => whatsappConfigFindMany(...a),
      upsert: (...a: any[]) => whatsappConfigUpsert(...a)
    }
  }
}));

const getEmailNotificationConfig = jest.fn();
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...a: any[]) => getEmailNotificationConfig(...a)
}));

const sendEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...a: any[]) => sendEmail(...a) }
}));

const sendWhatsappNotification = jest.fn();
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: (...a: any[]) => sendWhatsappNotification(...a)
}));

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  flushAuditEvents: jest.fn().mockResolvedValue(0)
}));

import { alertExpiringDocuments, alertExpiringLeases } from '../../src/lib/patrimoine/notifications';
import {
  getWhatsappNotificationConfig,
  listWhatsappNotificationConfigs,
  updateWhatsappNotificationConfig
} from '../../src/services/whatsapp-notification-config-service';

const TENANT = 'tenant-1';
const NOW = new Date('2026-09-28T00:00:00.000Z');
const OPT_IN_KEYS = ['OWNER_LEASE_ENDING_SOON', 'OWNER_DOCUMENT_EXPIRY_ALERT', 'OWNER_MONTHLY_REPORT_SENT'] as const;

const lease = {
  id: 'lease-1',
  lease_number: 'BAIL-2026-001',
  end_date: new Date('2026-10-15T00:00:00.000Z'),
  property_id: 'prop-1',
  owner_client_id: null,
  property: { internalReference: 'REF-1', ownerUserId: null }
};
const doc = {
  id: 'doc-1',
  propertyId: 'prop-1',
  documentType: 'INSURANCE',
  fileName: 'Assurance',
  expirationDate: new Date('2026-10-15T00:00:00.000Z'),
  property: { internalReference: 'REF-1', title: 'Villa', ownerUserId: null }
};

const ENABLED_ROW = { enabled: true, body_override: null, content_sid: null, content_variables_json: null };

/** Propriétaire joignable par WhatsApp (consentement par défaut), e-mail non consenti. */
function mockWhatsappOnlyOwner() {
  propertyOwnershipShareFindMany.mockResolvedValue([{ ownerClientId: 'client-1' }]);
  tenantClientFindMany.mockResolvedValue([{ id: 'client-1', details: { crmContactId: 'contact-1' } }]);
  crmContactFindMany.mockResolvedValue([
    {
      id: 'contact-1',
      email: 'owner@example.com',
      firstName: 'Awa',
      lastName: 'Koné',
      consentEmail: false,
      whatsappNumber: '+2250700000000',
      phonePrimary: null,
      consentWhatsapp: true,
      preferredContactChannel: 'WHATSAPP'
    }
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  // L'agence a COUPÉ l'alerte e-mail ; aucune ligne WhatsApp n'existe.
  getEmailNotificationConfig.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });
  whatsappConfigFindUnique.mockResolvedValue(null);
  whatsappConfigFindMany.mockResolvedValue([]);
  sendWhatsappNotification.mockResolvedValue(true);
  sendEmail.mockResolvedValue(undefined);
  markerFindMany.mockResolvedValue([]);
  markerCreate.mockResolvedValue({});
  tenantFindUnique.mockResolvedValue({ name: 'Agence' });
  tenantClientFindFirst.mockResolvedValue(null);
  propertyDocumentUpdateMany.mockResolvedValue({ count: 1 });
  rentalLeaseFindMany.mockResolvedValue([lease]);
  propertyDocumentFindMany.mockResolvedValue([doc]);
  mockWhatsappOnlyOwner();
});

describe('configuration WhatsApp : clés opt-in', () => {
  it.each(OPT_IN_KEYS)('%s : désactivée sans ligne de configuration', async key => {
    const config = await getWhatsappNotificationConfig(TENANT, key);
    expect(config.enabled).toBe(false);
  });

  it('une clé historique reste activée sans ligne', async () => {
    const config = await getWhatsappNotificationConfig(TENANT, 'OWNER_STATEMENT_SENT');
    expect(config.enabled).toBe(true);
  });

  it("l'écran de configuration reflète l'état réel : opt-in désactivées, les autres actives", async () => {
    const items = await listWhatsappNotificationConfigs(TENANT);
    for (const key of OPT_IN_KEYS) {
      expect(items.find(item => item.key === key)?.enabled).toBe(false);
    }
    expect(items.find(item => item.key === 'OWNER_STATEMENT_SENT')?.enabled).toBe(true);
  });

  it("une ligne explicite activée l'emporte", async () => {
    whatsappConfigFindUnique.mockResolvedValue(ENABLED_ROW);
    const config = await getWhatsappNotificationConfig(TENANT, 'OWNER_LEASE_ENDING_SOON');
    expect(config.enabled).toBe(true);
  });

  it("modifier seulement le texte d'une clé opt-in ne l'active pas", async () => {
    whatsappConfigUpsert.mockResolvedValue({
      id: 'c1',
      tenant_id: TENANT,
      notification_key: 'OWNER_LEASE_ENDING_SOON',
      enabled: false,
      body_override: 'x',
      content_sid: null,
      content_variables_json: null,
      created_at: NOW,
      updated_at: NOW
    });
    await updateWhatsappNotificationConfig(TENANT, 'OWNER_LEASE_ENDING_SOON', { bodyOverride: 'x' });
    expect(whatsappConfigUpsert.mock.calls[0][0].create.enabled).toBe(false);
  });
});

describe('alertes propriétaire : aucune ligne WhatsApp => rien ne part en WhatsApp', () => {
  it('bail : e-mail coupé, aucune ligne WhatsApp => aucun envoi', async () => {
    const result = await alertExpiringLeases(TENANT, { now: NOW });

    expect(sendWhatsappNotification).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it('document : e-mail coupé, aucune ligne WhatsApp => aucun envoi', async () => {
    const result = await alertExpiringDocuments(TENANT, { now: NOW });

    expect(sendWhatsappNotification).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it('bail : activation explicite de la clé => WhatsApp part', async () => {
    whatsappConfigFindUnique.mockResolvedValue(ENABLED_ROW);

    const result = await alertExpiringLeases(TENANT, { now: NOW });

    expect(result.sent).toBe(1);
    expect(sendWhatsappNotification).toHaveBeenCalledTimes(1);
    expect(sendWhatsappNotification.mock.calls[0][0]).toMatchObject({ notificationKey: 'OWNER_LEASE_ENDING_SOON' });
  });

  it('document : activation explicite de la clé => WhatsApp part', async () => {
    whatsappConfigFindUnique.mockResolvedValue(ENABLED_ROW);

    const result = await alertExpiringDocuments(TENANT, { now: NOW });

    expect(result.sent).toBe(1);
    expect(sendWhatsappNotification.mock.calls[0][0]).toMatchObject({ notificationKey: 'OWNER_DOCUMENT_EXPIRY_ALERT' });
  });
});

describe('alertes : destinataires sans canal actif écartés en amont', () => {
  it('e-mail actif mais propriétaire joignable seulement par WhatsApp (opt-in absent) : skippedNoRecipient, pas failed, pas de marque posée', async () => {
    getEmailNotificationConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });

    const docs = await alertExpiringDocuments(TENANT, { now: NOW });
    expect(docs).toMatchObject({ sent: 0, failed: 0, skippedNoRecipient: 1 });
    expect(propertyDocumentUpdateMany).not.toHaveBeenCalled();

    const leases = await alertExpiringLeases(TENANT, { now: NOW });
    expect(leases).toMatchObject({ sent: 0, failed: 0, skippedNoRecipient: 1 });
  });
});
