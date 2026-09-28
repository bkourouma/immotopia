/**
 * `jobs/document-expiry-alert-job.ts` — `runDocumentExpiryAlerts`, isolation
 * multi-agence.
 *
 * Mock à la frontière `utils/database` (règle de `.claude/rules/testing.md`
 * pour un test de service) : `lib/patrimoine/notifications.ts` tourne pour de
 * vrai par-dessus, comme en production, plutôt que d'être mocké -- le point à
 * vérifier ici est que `runWithTenantContext` pose le bon tenant avant chaque
 * requête, et que le traitement reste séquentiel, agence par agence ; le
 * détail de l'algorithme d'alerte est couvert par
 * `patrimoine.document-expiry-alert.test.ts`.
 */

const tenantFindMany = jest.fn();
const propertyDocumentFindMany = jest.fn();
const propertyDocumentUpdateMany = jest.fn();
const propertyOwnershipShareFindMany = jest.fn();
const tenantClientFindMany = jest.fn();
const crmContactFindMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    tenant: {
      findMany: (...a: any[]) => tenantFindMany(...a)
    },
    propertyDocument: {
      findMany: (...a: any[]) => propertyDocumentFindMany(...a),
      updateMany: (...a: any[]) => propertyDocumentUpdateMany(...a)
    },
    propertyOwnershipShare: {
      findMany: (...a: any[]) => propertyOwnershipShareFindMany(...a)
    },
    tenantClient: {
      findFirst: jest.fn().mockResolvedValue(null),
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

const sendEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...a: any[]) => sendEmail(...a) }
}));

jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: jest.fn()
}));

import { getCurrentTenantId } from '../../src/utils/tenant-context';
import { runDocumentExpiryAlerts } from '../../src/jobs/document-expiry-alert-job';

const NOW = new Date('2026-09-28T07:00:00.000Z');

function docFor(tenantId: string, docId: string) {
  return {
    id: docId,
    propertyId: `prop-${tenantId}`,
    documentType: 'INSURANCE',
    fileName: 'Assurance',
    expirationDate: new Date('2026-10-01T00:00:00.000Z'),
    property: { internalReference: `REF-${tenantId}`, title: 'Bien', ownerUserId: null }
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getEmailNotificationConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  propertyDocumentUpdateMany.mockResolvedValue({ count: 1 });
  sendEmail.mockResolvedValue(undefined);
  propertyOwnershipShareFindMany.mockResolvedValue([{ ownerClientId: 'client-1' }]);
  tenantClientFindMany.mockResolvedValue([{ id: 'client-1', details: { crmContactId: 'contact-1' } }]);
  crmContactFindMany.mockResolvedValue([
    { id: 'contact-1', email: 'owner@example.com', firstName: 'Awa', lastName: 'Koné', consentEmail: true }
  ]);
});

describe('runDocumentExpiryAlerts — isolation multi-agence', () => {
  it('interroge uniquement les agences actives', async () => {
    tenantFindMany.mockResolvedValue([]);

    await runDocumentExpiryAlerts(NOW);

    expect(tenantFindMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', isActive: true },
      select: { id: true }
    });
  });

  it('traite chaque agence séquentiellement, dans son propre contexte tenant', async () => {
    tenantFindMany.mockResolvedValue([{ id: 'tenant-a' }, { id: 'tenant-b' }]);
    const seenTenantIdsAtQueryTime: (string | undefined)[] = [];
    propertyDocumentFindMany.mockImplementation(async (args: any) => {
      seenTenantIdsAtQueryTime.push(getCurrentTenantId());
      // La requête porte le même tenantId que le contexte ambiant : la
      // garde-fou Prisma (utils/prisma-tenant-guard-extension.ts) le
      // vérifierait de la même façon en production.
      expect(args.where.tenantId).toBe(getCurrentTenantId());
      return [docFor(args.where.tenantId, `doc-${args.where.tenantId}`)];
    });

    const report = await runDocumentExpiryAlerts(NOW);

    expect(seenTenantIdsAtQueryTime).toEqual(['tenant-a', 'tenant-b']);
    expect(report).toMatchObject({ tenants: 2, matched: 2, sent: 2, failedTenants: 0 });
  });

  it("une agence en erreur n'empêche pas le traitement de la suivante", async () => {
    tenantFindMany.mockResolvedValue([{ id: 'tenant-a' }, { id: 'tenant-b' }]);
    propertyDocumentFindMany.mockImplementation(async (args: any) => {
      if (args.where.tenantId === 'tenant-a') throw new Error('boom');
      return [docFor(args.where.tenantId, 'doc-b')];
    });

    const report = await runDocumentExpiryAlerts(NOW);

    expect(report.tenants).toBe(2);
    expect(report.failedTenants).toBe(1);
    expect(report.sent).toBe(1);
    expect(report.matched).toBe(1);
  });
});
