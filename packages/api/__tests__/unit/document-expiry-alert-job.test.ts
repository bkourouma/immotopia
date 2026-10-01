/**
 * `jobs/document-expiry-alert-job.ts` — `runDocumentExpiryAlerts`, isolation
 * multi-agence.
 *
 * Mock à la frontière `utils/database` (règle de `.claude/rules/testing.md`
 * pour un test de service) : `lib/patrimoine/notifications.ts` tourne pour de
 * vrai par-dessus, comme en production, plutôt que d'être mocké -- le point à
 * vérifier ici est que `runWithTenantContext` pose le bon tenant avant chaque
 * requête, et que le traitement reste séquentiel, agence par agence, pour les
 * cinq alertes désormais enchaînées (documents, baux, emprunts, travaux, étapes
 * foncières en retard) ;
 * le détail de chaque algorithme d'alerte est couvert par son propre test
 * dédié (`patrimoine.document-expiry-alert.test.ts`,
 * `patrimoine.deadline-alerts.test.ts`, `patrimoine.land-alerts.test.ts`). Les quatre alertes étendues ne
 * trouvent ici aucune ligne (mocks vides) : seule celle des documents est
 * exercée, comme avant l'extension du lot P3.
 */

const tenantFindMany = jest.fn();
const propertyDocumentFindMany = jest.fn();
const propertyDocumentUpdateMany = jest.fn();
const propertyOwnershipShareFindMany = jest.fn();
const tenantClientFindMany = jest.fn();
const crmContactFindMany = jest.fn();
const rentalLeaseFindMany = jest.fn();
const propertyLoanFindMany = jest.fn();
const workProgramFindMany = jest.fn();
const landRegularizationStepFindMany = jest.fn();
const auditLogFindMany = jest.fn();
const tenantFindUnique = jest.fn();
const roleFindUnique = jest.fn();
const userRoleFindMany = jest.fn();
const userFindMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    tenant: {
      findMany: (...a: any[]) => tenantFindMany(...a),
      findUnique: (...a: any[]) => tenantFindUnique(...a)
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
    },
    rentalLease: {
      findMany: (...a: any[]) => rentalLeaseFindMany(...a)
    },
    propertyLoan: {
      findMany: (...a: any[]) => propertyLoanFindMany(...a)
    },
    workProgram: {
      findMany: (...a: any[]) => workProgramFindMany(...a)
    },
    landRegularizationStep: {
      findMany: (...a: any[]) => landRegularizationStepFindMany(...a)
    },
    auditLog: {
      findMany: (...a: any[]) => auditLogFindMany(...a)
    },
    role: {
      findUnique: (...a: any[]) => roleFindUnique(...a)
    },
    userRole: {
      findMany: (...a: any[]) => userRoleFindMany(...a)
    },
    user: {
      findMany: (...a: any[]) => userFindMany(...a)
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

jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: jest.fn()
}));

const logAuditEvent = jest.fn();
const flushAuditEvents = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => logAuditEvent(...a),
  flushAuditEvents: (...a: any[]) => flushAuditEvents(...a)
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
  getWhatsappNotificationConfig.mockResolvedValue({ enabled: false });
  getEmailNotificationConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  propertyDocumentUpdateMany.mockResolvedValue({ count: 1 });
  sendEmail.mockResolvedValue(undefined);
  propertyOwnershipShareFindMany.mockResolvedValue([{ ownerClientId: 'client-1' }]);
  tenantClientFindMany.mockResolvedValue([{ id: 'client-1', details: { crmContactId: 'contact-1' } }]);
  crmContactFindMany.mockResolvedValue([
    { id: 'contact-1', email: 'owner@example.com', firstName: 'Awa', lastName: 'Koné', consentEmail: true }
  ]);
  // Les trois alertes étendues (lot P3) ne trouvent rien à alerter ici :
  // seul le comportement des documents (déjà couvert avant l'extension) est
  // exercé par ce fichier.
  rentalLeaseFindMany.mockResolvedValue([]);
  propertyLoanFindMany.mockResolvedValue([]);
  workProgramFindMany.mockResolvedValue([]);
  landRegularizationStepFindMany.mockResolvedValue([]);
  auditLogFindMany.mockResolvedValue([]);
  tenantFindUnique.mockResolvedValue({ name: 'Agence', contactEmail: null });
  roleFindUnique.mockResolvedValue(null);
  userRoleFindMany.mockResolvedValue([]);
  userFindMany.mockResolvedValue([]);
  flushAuditEvents.mockResolvedValue(0);
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
