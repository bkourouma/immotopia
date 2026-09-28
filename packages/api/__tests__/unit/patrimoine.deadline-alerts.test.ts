/**
 * `lib/patrimoine/notifications.ts` — `alertExpiringLeases`,
 * `alertLoanMaturity`, `alertUpcomingWorks` (lot P3).
 *
 * Mock à la frontière `utils/database`, comme l'exige `.claude/rules/testing.md`
 * pour un test de service ; les autres dépendances (config des notifications,
 * envoi d'e-mail, audit) sont aussi mockées, chaque factory couvrant tous les
 * exports utilisés par le fichier testé (AGENTS.md).
 */

const rentalLeaseFindMany = jest.fn();
const propertyLoanFindMany = jest.fn();
const workProgramFindMany = jest.fn();
const auditLogFindMany = jest.fn();
const tenantFindUnique = jest.fn();
const roleFindUnique = jest.fn();
const userRoleFindMany = jest.fn();
const userFindMany = jest.fn();
const propertyOwnershipShareFindMany = jest.fn();
const tenantClientFindFirst = jest.fn();
const tenantClientFindMany = jest.fn();
const crmContactFindMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalLease: {
      findMany: (...a: any[]) => rentalLeaseFindMany(...a)
    },
    propertyLoan: {
      findMany: (...a: any[]) => propertyLoanFindMany(...a)
    },
    workProgram: {
      findMany: (...a: any[]) => workProgramFindMany(...a)
    },
    auditLog: {
      findMany: (...a: any[]) => auditLogFindMany(...a)
    },
    tenant: {
      findUnique: (...a: any[]) => tenantFindUnique(...a)
    },
    role: {
      findUnique: (...a: any[]) => roleFindUnique(...a)
    },
    userRole: {
      findMany: (...a: any[]) => userRoleFindMany(...a)
    },
    user: {
      findMany: (...a: any[]) => userFindMany(...a)
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

import { AuditActionKey } from '../../src/types/audit-types';
import { alertExpiringLeases, alertLoanMaturity, alertUpcomingWorks } from '../../src/lib/patrimoine/notifications';

const TENANT = 'tenant-1';
const NOW = new Date('2026-09-28T00:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  getEmailNotificationConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  sendEmail.mockResolvedValue(undefined);
  auditLogFindMany.mockResolvedValue([]);
  flushAuditEvents.mockResolvedValue(0);
  tenantFindUnique.mockResolvedValue({ name: 'Agence Koumassi', contactEmail: null });
  roleFindUnique.mockResolvedValue(null);
  userRoleFindMany.mockResolvedValue([]);
  userFindMany.mockResolvedValue([]);
  propertyOwnershipShareFindMany.mockResolvedValue([]);
  tenantClientFindFirst.mockResolvedValue(null);
  tenantClientFindMany.mockResolvedValue([]);
  crmContactFindMany.mockResolvedValue([]);
});

describe('alertExpiringLeases', () => {
  function baseLease(overrides: Record<string, unknown> = {}) {
    return {
      id: 'lease-1',
      lease_number: 'BAIL-2026-001',
      end_date: new Date('2026-10-15T00:00:00.000Z'),
      property_id: 'prop-1',
      property: { internalReference: 'REF-1', ownerUserId: null },
      ...overrides
    };
  }

  function mockEligibleOwner() {
    propertyOwnershipShareFindMany.mockResolvedValue([{ ownerClientId: 'client-1' }]);
    tenantClientFindMany.mockResolvedValue([{ id: 'client-1', details: { crmContactId: 'contact-1' } }]);
    crmContactFindMany.mockResolvedValue([
      { id: 'contact-1', email: 'owner@example.com', firstName: 'Awa', lastName: 'Koné', consentEmail: true }
    ]);
  }

  it('alerte le propriétaire consentant et pose la marque anti-doublon', async () => {
    rentalLeaseFindMany.mockResolvedValue([baseLease()]);
    mockEligibleOwner();

    const report = await alertExpiringLeases(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 1, sent: 1, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: 'owner@example.com', tenantId: TENANT });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        actionKey: AuditActionKey.PATRIMOINE_LEASE_END_ALERT_SENT,
        entityType: 'RentalLease',
        entityId: 'lease-1'
      })
    );
    expect(flushAuditEvents).toHaveBeenCalled();
  });

  it('ignore un bail déjà alerté (marque présente dans AuditLog)', async () => {
    rentalLeaseFindMany.mockResolvedValue([baseLease()]);
    auditLogFindMany.mockResolvedValue([{ entityId: 'lease-1' }]);
    mockEligibleOwner();

    const report = await alertExpiringLeases(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 1, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 1, failed: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('ne marque pas un bail sans destinataire éligible (retenté le lendemain)', async () => {
    rentalLeaseFindMany.mockResolvedValue([baseLease()]);
    // Aucune part d'indivision, aucun contact CRM : pas de destinataire.

    const report = await alertExpiringLeases(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 1, sent: 0, skippedNoRecipient: 1, skippedAlreadySent: 0, failed: 0 });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("n'envoie rien si la notification est désactivée pour l'agence", async () => {
    getEmailNotificationConfig.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });

    const report = await alertExpiringLeases(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 0, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 });
    expect(rentalLeaseFindMany).not.toHaveBeenCalled();
  });

  it('échappe le texte utilisateur injecté dans le corps HTML', async () => {
    rentalLeaseFindMany.mockResolvedValue([baseLease()]);
    propertyOwnershipShareFindMany.mockResolvedValue([{ ownerClientId: 'client-1' }]);
    tenantClientFindMany.mockResolvedValue([{ id: 'client-1', details: { crmContactId: 'contact-1' } }]);
    crmContactFindMany.mockResolvedValue([
      {
        id: 'contact-1',
        email: 'owner@example.com',
        firstName: '<script>alert(1)</script>',
        lastName: '',
        consentEmail: true
      }
    ]);

    await alertExpiringLeases(TENANT, { now: NOW });

    const html = sendEmail.mock.calls[0][0].html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('alertLoanMaturity', () => {
  function baseLoan(overrides: Record<string, unknown> = {}) {
    return {
      id: 'loan-1',
      endDate: new Date('2026-10-20T00:00:00.000Z'),
      property: { internalReference: 'REF-2' },
      ...overrides
    };
  }

  it("alerte les administrateurs actifs de l'agence (rôle TENANT_ADMIN)", async () => {
    propertyLoanFindMany.mockResolvedValue([baseLoan()]);
    roleFindUnique.mockResolvedValue({ id: 'role-admin' });
    userRoleFindMany.mockResolvedValue([{ userId: 'user-1' }]);
    userFindMany.mockResolvedValue([{ email: 'admin@agence.example', fullName: 'Admin Agence' }]);

    const report = await alertLoanMaturity(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 1, sent: 1, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@agence.example' }));
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: AuditActionKey.PATRIMOINE_LOAN_MATURITY_ALERT_SENT, entityId: 'loan-1' })
    );
  });

  it("se rabat sur l'e-mail de contact de l'agence si aucun administrateur actif", async () => {
    propertyLoanFindMany.mockResolvedValue([baseLoan()]);
    roleFindUnique.mockResolvedValue(null);
    tenantFindUnique.mockResolvedValue({ name: 'Agence', contactEmail: 'contact@agence.example' });

    const report = await alertLoanMaturity(TENANT, { now: NOW });

    expect(report.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'contact@agence.example' }));
  });

  it('ne marque pas et ne relance personne si aucun destinataire (ni admin ni contact agence)', async () => {
    propertyLoanFindMany.mockResolvedValue([baseLoan()]);
    roleFindUnique.mockResolvedValue(null);
    tenantFindUnique.mockResolvedValue({ name: 'Agence', contactEmail: null });

    const report = await alertLoanMaturity(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 1, sent: 0, skippedNoRecipient: 1, skippedAlreadySent: 0, failed: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('ignore un emprunt déjà alerté', async () => {
    propertyLoanFindMany.mockResolvedValue([baseLoan()]);
    auditLogFindMany.mockResolvedValue([{ entityId: 'loan-1' }]);
    roleFindUnique.mockResolvedValue({ id: 'role-admin' });
    userRoleFindMany.mockResolvedValue([{ userId: 'user-1' }]);
    userFindMany.mockResolvedValue([{ email: 'admin@agence.example', fullName: 'Admin' }]);

    const report = await alertLoanMaturity(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 1, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 1, failed: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('alertUpcomingWorks', () => {
  function baseWork(overrides: Record<string, unknown> = {}) {
    return {
      id: 'work-1',
      title: 'Réfection toiture',
      plannedDate: new Date('2026-10-10T00:00:00.000Z'),
      property: { internalReference: 'REF-3' },
      ...overrides
    };
  }

  it("alerte les administrateurs actifs de l'agence pour un programme planifié", async () => {
    workProgramFindMany.mockResolvedValue([baseWork()]);
    roleFindUnique.mockResolvedValue({ id: 'role-admin' });
    userRoleFindMany.mockResolvedValue([{ userId: 'user-1' }]);
    userFindMany.mockResolvedValue([{ email: 'admin@agence.example', fullName: 'Admin Agence' }]);

    const report = await alertUpcomingWorks(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 1, sent: 1, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: AuditActionKey.PATRIMOINE_WORK_UPCOMING_ALERT_SENT, entityId: 'work-1' })
    );
  });

  it('ignore un programme déjà alerté', async () => {
    workProgramFindMany.mockResolvedValue([baseWork()]);
    auditLogFindMany.mockResolvedValue([{ entityId: 'work-1' }]);

    const report = await alertUpcomingWorks(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 1, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 1, failed: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("n'envoie rien si la notification est désactivée", async () => {
    getEmailNotificationConfig.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });

    const report = await alertUpcomingWorks(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 0, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 });
    expect(workProgramFindMany).not.toHaveBeenCalled();
  });
});
