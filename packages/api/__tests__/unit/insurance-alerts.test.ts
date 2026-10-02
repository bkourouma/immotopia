/**
 * `lib/patrimoine/insurance-alerts.ts` — alertes d'échéance des polices
 * d'assurance, de la prochaine échéance d'entretien et de la fin de garantie
 * (lot B1, spec 032).
 *
 * Mock à la frontière `utils/database` ; e-mail et configuration mockés :
 * aucun envoi réel. Les marques anti-doublon sont des `NotificationMarker`.
 */

const insurancePolicyFindMany = jest.fn();
const maintenanceLogEntryFindMany = jest.fn();
const markerFindMany = jest.fn();
const markerCreate = jest.fn();
const tenantFindUnique = jest.fn();
const roleFindUnique = jest.fn();
const userRoleFindMany = jest.fn();
const userFindMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    insurancePolicy: { findMany: (...a: any[]) => insurancePolicyFindMany(...a) },
    maintenanceLogEntry: { findMany: (...a: any[]) => maintenanceLogEntryFindMany(...a) },
    notificationMarker: {
      findMany: (...a: any[]) => markerFindMany(...a),
      create: (...a: any[]) => markerCreate(...a)
    },
    tenant: { findUnique: (...a: any[]) => tenantFindUnique(...a) },
    role: { findUnique: (...a: any[]) => roleFindUnique(...a) },
    userRole: { findMany: (...a: any[]) => userRoleFindMany(...a) },
    user: { findMany: (...a: any[]) => userFindMany(...a) }
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

import {
  alertExpiringInsurancePolicies,
  alertMaintenanceDeadlines,
  runInsuranceAlerts
} from '../../src/lib/patrimoine/insurance-alerts';

const TENANT = 'tenant-1';
const NOW = new Date('2026-10-01T09:30:00.000Z');
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function policy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pol-1',
    insurer: 'NSIA',
    policyNumber: 'P-42',
    endDate: day('2026-10-20'),
    property: { internalReference: 'REF-1' },
    ...overrides
  };
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    category: 'PLUMBING',
    description: 'Remplacement du chauffe-eau',
    nextDueDate: null,
    warrantyEndDate: null,
    property: { internalReference: 'REF-1' },
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getEmailNotificationConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  sendEmail.mockResolvedValue(undefined);
  markerFindMany.mockResolvedValue([]);
  markerCreate.mockResolvedValue({});
  tenantFindUnique.mockResolvedValue({ name: 'Agence', contactEmail: null });
  roleFindUnique.mockResolvedValue({ id: 'role-admin' });
  userRoleFindMany.mockResolvedValue([{ userId: 'u1' }]);
  userFindMany.mockResolvedValue([{ email: 'admin@agence.test', fullName: 'Admin' }]);
  insurancePolicyFindMany.mockResolvedValue([]);
  maintenanceLogEntryFindMany.mockResolvedValue([]);
});

describe('alertExpiringInsurancePolicies', () => {
  it('interroge la fenêtre [début du jour, début de J+31[ (J+30 entier inclus), filtrée par agence', async () => {
    await alertExpiringInsurancePolicies(TENANT, { now: NOW });
    const where = insurancePolicyFindMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT);
    expect(where.endDate.gte).toEqual(day('2026-10-01'));
    expect(where.endDate.lt).toEqual(day('2026-11-01'));
    expect(where.endDate.lte).toBeUndefined();
  });

  it('envoie une alerte aux administrateurs et pose la marque POLICY', async () => {
    insurancePolicyFindMany.mockResolvedValue([policy()]);
    const result = await alertExpiringInsurancePolicies(TENANT, { now: NOW });

    expect(result).toEqual({ matched: 1, sent: 1, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('admin@agence.test');
    expect(mail.tenantId).toBe(TENANT);
    expect(mail.subject).toContain('REF-1');
    expect(mail.html).toContain('NSIA');
    expect(mail.html).toContain('20/10/2026');
    expect(markerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT,
        kind: 'PATRIMOINE_INSURANCE_POLICY_ALERT_SENT',
        entityType: 'InsurancePolicy',
        entityId: 'pol-1::POLICY::2026-10-20'
      })
    });
  });

  it('aucun doublon au 2e passage : la marque exclut la police', async () => {
    insurancePolicyFindMany.mockResolvedValue([policy()]);
    markerFindMany.mockResolvedValue([{ entityId: 'pol-1::POLICY::2026-10-20' }]);
    const result = await alertExpiringInsurancePolicies(TENANT, { now: NOW });

    expect(result).toEqual({ matched: 1, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 1, failed: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(markerCreate).not.toHaveBeenCalled();
  });

  it("événement désactivé : rien d'envoyé, rien de marqué", async () => {
    getEmailNotificationConfig.mockResolvedValue({ enabled: false });
    const result = await alertExpiringInsurancePolicies(TENANT, { now: NOW });
    expect(result).toEqual({ matched: 0, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 });
    expect(insurancePolicyFindMany).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(markerCreate).not.toHaveBeenCalled();
  });

  it('aucun destinataire : compté, non marqué (réessayé le lendemain)', async () => {
    insurancePolicyFindMany.mockResolvedValue([policy()]);
    roleFindUnique.mockResolvedValue(null);
    const result = await alertExpiringInsurancePolicies(TENANT, { now: NOW });
    expect(result.skippedNoRecipient).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(markerCreate).not.toHaveBeenCalled();
  });

  it('repli sur Tenant.contactEmail sans administrateur', async () => {
    insurancePolicyFindMany.mockResolvedValue([policy()]);
    userFindMany.mockResolvedValue([]);
    tenantFindUnique.mockResolvedValue({ name: 'Agence', contactEmail: 'contact@agence.test' });
    const result = await alertExpiringInsurancePolicies(TENANT, { now: NOW });
    expect(result.sent).toBe(1);
    expect(sendEmail.mock.calls[0][0].to).toBe('contact@agence.test');
  });

  it("un échec d'envoi ne marque pas la police", async () => {
    insurancePolicyFindMany.mockResolvedValue([policy()]);
    sendEmail.mockRejectedValue(new Error('SMTP indisponible'));
    const result = await alertExpiringInsurancePolicies(TENANT, { now: NOW });
    expect(result).toEqual({ matched: 1, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 1 });
    expect(markerCreate).not.toHaveBeenCalled();
  });

  it('échappe le texte saisi dans le corps HTML, mais pas dans le sujet', async () => {
    insurancePolicyFindMany.mockResolvedValue([
      policy({ insurer: '<script>alert(1)</script>', property: { internalReference: 'R&D "1"' } })
    ]);
    await alertExpiringInsurancePolicies(TENANT, { now: NOW });
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('R&amp;D &quot;1&quot;');
  });
});

describe('alertMaintenanceDeadlines', () => {
  it('distingue DUE et WARRANTY : deux alertes et deux marques pour une même entrée', async () => {
    maintenanceLogEntryFindMany.mockResolvedValue([
      entry({ nextDueDate: day('2026-10-10'), warrantyEndDate: day('2026-10-25') })
    ]);
    const result = await alertMaintenanceDeadlines(TENANT, { now: NOW });

    expect(result.matched).toBe(2);
    expect(result.sent).toBe(2);
    const keys = markerCreate.mock.calls.map(call => call[0].data.entityId);
    expect(keys).toEqual(['log-1::DUE::2026-10-10', 'log-1::WARRANTY::2026-10-25']);
    expect(markerCreate.mock.calls[0][0].data).toMatchObject({
      kind: 'PATRIMOINE_MAINTENANCE_DUE_ALERT_SENT',
      entityType: 'MaintenanceLogEntry'
    });
    const subjects = sendEmail.mock.calls.map(call => call[0].subject);
    expect(subjects[0]).toContain("Prochaine échéance d'entretien");
    expect(subjects[1]).toContain('Fin de garantie');
  });

  it('ignore une date hors fenêtre (J+31) et inclut les bornes J et J+30', async () => {
    maintenanceLogEntryFindMany.mockResolvedValue([
      entry({ id: 'a', nextDueDate: day('2026-10-01') }),
      entry({ id: 'b', nextDueDate: new Date('2026-10-31T15:45:00.000Z') }),
      entry({ id: 'c', nextDueDate: day('2026-11-01') }),
      entry({ id: 'd', warrantyEndDate: day('2026-09-30') })
    ]);
    const result = await alertMaintenanceDeadlines(TENANT, { now: NOW });
    expect(result.matched).toBe(2);
    expect(markerCreate.mock.calls.map(c => c[0].data.entityId)).toEqual(['a::DUE::2026-10-01', 'b::DUE::2026-10-31']);
  });

  it('lit la configuration e-mail une seule fois par alerte', async () => {
    maintenanceLogEntryFindMany.mockResolvedValue([entry({ nextDueDate: day('2026-10-10') })]);
    await alertMaintenanceDeadlines(TENANT, { now: NOW });
    expect(getEmailNotificationConfig).toHaveBeenCalledTimes(1);
  });

  it('aucun doublon au 2e passage sur la marque DUE, la garantie reste alertée', async () => {
    maintenanceLogEntryFindMany.mockResolvedValue([
      entry({ nextDueDate: day('2026-10-10'), warrantyEndDate: day('2026-10-25') })
    ]);
    markerFindMany.mockResolvedValue([{ entityId: 'log-1::DUE::2026-10-10' }]);
    const result = await alertMaintenanceDeadlines(TENANT, { now: NOW });
    expect(result).toMatchObject({ matched: 2, sent: 1, skippedAlreadySent: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("événement désactivé : rien d'envoyé", async () => {
    getEmailNotificationConfig.mockResolvedValue({ enabled: false });
    const result = await alertMaintenanceDeadlines(TENANT, { now: NOW });
    expect(result.matched).toBe(0);
    expect(maintenanceLogEntryFindMany).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('filtre par agence et échappe la description', async () => {
    maintenanceLogEntryFindMany.mockResolvedValue([entry({ nextDueDate: day('2026-10-10'), description: '<b>x</b>' })]);
    await alertMaintenanceDeadlines(TENANT, { now: NOW });
    expect(maintenanceLogEntryFindMany.mock.calls[0][0].where.tenantId).toBe(TENANT);
    expect(sendEmail.mock.calls[0][0].html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('runInsuranceAlerts', () => {
  it('agrège les polices et le carnet d’entretien', async () => {
    insurancePolicyFindMany.mockResolvedValue([policy()]);
    maintenanceLogEntryFindMany.mockResolvedValue([entry({ warrantyEndDate: day('2026-10-25') })]);
    const result = await runInsuranceAlerts(TENANT, { now: NOW });
    expect(result).toEqual({ matched: 2, sent: 2, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});
