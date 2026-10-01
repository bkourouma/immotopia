/**
 * `lib/patrimoine/land-alerts.ts` — `alertOverdueLandSteps` (spec 033, lot B2).
 *
 * Mock à la frontière `utils/database` (`.claude/rules/testing.md`) ; config
 * des notifications, envoi d'e-mail et audit sont mockés : aucun envoi réel.
 * Chaque factory couvre tous les exports utilisés par le fichier testé.
 */

const landRegularizationStepFindMany = jest.fn();
const auditLogFindMany = jest.fn();
const tenantFindUnique = jest.fn();
const roleFindUnique = jest.fn();
const userRoleFindMany = jest.fn();
const userFindMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    landRegularizationStep: { findMany: (...a: any[]) => landRegularizationStepFindMany(...a) },
    auditLog: { findMany: (...a: any[]) => auditLogFindMany(...a) },
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

const logAuditEvent = jest.fn();
const flushAuditEvents = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => logAuditEvent(...a),
  flushAuditEvents: (...a: any[]) => flushAuditEvents(...a)
}));

import { AuditActionKey } from '../../src/types/audit-types';
import { env } from '../../src/config/env';
import { alertOverdueLandSteps } from '../../src/lib/patrimoine/land-alerts';

const TENANT = 'tenant-1';
const NOW = new Date('2026-10-10T07:00:00.000Z');

function baseStep(overrides: Record<string, unknown> = {}) {
  return {
    id: 'step-1',
    stepKey: 'bornage_contradictoire',
    label: 'Bornage contradictoire',
    dueDate: new Date('2026-10-05T00:00:00.000Z'),
    regularization: {
      id: 'reg-1',
      track: 'CI_ACD',
      property: { internalReference: 'REF-1' }
    },
    ...overrides
  };
}

function mockAdmins(emails: string[] = ['admin@example.com']) {
  roleFindUnique.mockResolvedValue({ id: 'role-admin' });
  userRoleFindMany.mockResolvedValue(emails.map((_, index) => ({ userId: `user-${index}` })));
  userFindMany.mockResolvedValue(emails.map(email => ({ email, fullName: 'Admin' })));
}

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
  landRegularizationStepFindMany.mockResolvedValue([]);
  mockAdmins();
});

describe('alertOverdueLandSteps', () => {
  it('alerte les administrateurs pour une étape en retard et pose la marque anti-doublon (id + échéance)', async () => {
    landRegularizationStepFindMany.mockResolvedValue([baseStep()]);

    const report = await alertOverdueLandSteps(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 1, sent: 1, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 });
    expect(getEmailNotificationConfig).toHaveBeenCalledWith(TENANT, 'LAND_STEP_OVERDUE_ALERT');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail).toMatchObject({ to: 'admin@example.com', tenantId: TENANT });
    expect(mail.subject).toContain('REF-1');
    expect(mail.html).toContain('Bornage contradictoire');
    expect(mail.html).toContain("Côte d'Ivoire — de l'attestation villageoise au titre foncier");
    expect(mail.html).toContain('REF-1');
    expect(mail.html).toContain('05/10/2026');
    expect(mail.html).toContain('Agence Koumassi');
    expect(mail.html).toContain(`${env.FRONTEND_URL.replace(/\/+$/, '')}/tenant/${TENANT}/patrimoine/land/reg-1`);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        actionKey: AuditActionKey.PATRIMOINE_LAND_STEP_OVERDUE_ALERT_SENT,
        entityType: 'LandRegularizationStep',
        entityId: 'step-1::2026-10-05',
        payload: expect.objectContaining({ stepId: 'step-1', regularizationId: 'reg-1' })
      })
    );
    expect(flushAuditEvents).toHaveBeenCalled();
  });

  it("ne demande à la base que les étapes A_FAIRE/EN_COURS échues avant le début du jour UTC, d'un dossier EN_COURS du bon tenant", async () => {
    await alertOverdueLandSteps(TENANT, { now: NOW });

    expect(landRegularizationStepFindMany).toHaveBeenCalledTimes(1);
    const { where } = landRegularizationStepFindMany.mock.calls[0][0];
    expect(where).toEqual({
      tenantId: TENANT,
      status: { in: ['A_FAIRE', 'EN_COURS'] },
      dueDate: { lt: new Date('2026-10-10T00:00:00.000Z') },
      regularization: { tenantId: TENANT, status: 'EN_COURS' }
    });
  });

  it('étape personnalisée : le texte saisi et le libellé de filière personnalisée', async () => {
    landRegularizationStepFindMany.mockResolvedValue([
      baseStep({
        stepKey: 'custom_1',
        label: 'Rendez-vous <b>mairie</b>',
        regularization: { id: 'reg-2', track: 'PERSONNALISEE', property: { internalReference: 'REF-2' } }
      })
    ]);

    await alertOverdueLandSteps(TENANT, { now: NOW });

    const html = sendEmail.mock.calls[0][0].html as string;
    expect(html).toContain('Personnalisée');
    expect(html).not.toContain('<b>mairie</b>');
    expect(html).toContain('Rendez-vous &lt;b&gt;mairie&lt;/b&gt;');
  });

  it('calcule le retard en jours calendaires UTC (hier : 1 jour)', async () => {
    landRegularizationStepFindMany.mockResolvedValue([
      baseStep({ id: 'step-a', dueDate: new Date('2026-10-05T00:00:00.000Z') }),
      baseStep({ id: 'step-b', dueDate: new Date('2026-10-09T00:00:00.000Z') })
    ]);

    await alertOverdueLandSteps(TENANT, { now: NOW });

    expect(sendEmail.mock.calls[0][0].html).toContain('dépassée de 5 jour(s)');
    expect(sendEmail.mock.calls[1][0].html).toContain('dépassée de 1 jour(s)');
  });

  it("n'envoie rien quand aucune étape n'est en retard (échéance future, étape terminée/bloquée, dossier non en cours : filtrés en base)", async () => {
    landRegularizationStepFindMany.mockResolvedValue([]);

    const report = await alertOverdueLandSteps(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 0, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('ignore par prudence une étape sans échéance renvoyée par la base', async () => {
    landRegularizationStepFindMany.mockResolvedValue([baseStep({ dueDate: null })]);

    const report = await alertOverdueLandSteps(TENANT, { now: NOW });

    expect(report.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("une échéance d'aujourd'hui n'est pas en retard : le seuil est le début du jour UTC, quelle que soit l'heure du job", async () => {
    await alertOverdueLandSteps(TENANT, { now: new Date('2026-10-10T23:59:00.000Z') });

    const { where } = landRegularizationStepFindMany.mock.calls[0][0];
    expect(where.dueDate).toEqual({ lt: new Date('2026-10-10T00:00:00.000Z') });
  });

  it("seuls les administrateurs membres ACTIFS de l'agence sont destinataires", async () => {
    landRegularizationStepFindMany.mockResolvedValue([baseStep()]);

    await alertOverdueLandSteps(TENANT, { now: NOW });

    expect(userFindMany.mock.calls[0][0].where).toEqual({
      id: { in: ['user-0'] },
      isActive: true,
      memberships: { some: { tenantId: TENANT, status: 'ACTIVE' } }
    });
  });

  it('deuxième passage : une étape déjà alertée pour la même échéance est ignorée', async () => {
    landRegularizationStepFindMany.mockResolvedValue([baseStep()]);
    auditLogFindMany.mockResolvedValue([{ entityId: 'step-1::2026-10-05' }]);

    const report = await alertOverdueLandSteps(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 1, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 1, failed: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(auditLogFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT,
        actionKey: AuditActionKey.PATRIMOINE_LAND_STEP_OVERDUE_ALERT_SENT,
        entityType: 'LandRegularizationStep',
        entityId: { in: ['step-1::2026-10-05'] }
      },
      select: { entityId: true }
    });
  });

  it('échéance déplacée : une nouvelle relance part pour la nouvelle date', async () => {
    landRegularizationStepFindMany.mockResolvedValue([baseStep({ dueDate: new Date('2026-10-08T00:00:00.000Z') })]);
    auditLogFindMany.mockResolvedValue([{ entityId: 'step-1::2026-10-05' }]);

    const report = await alertOverdueLandSteps(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 1, sent: 1, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'step-1::2026-10-08' }));
  });

  it('aucun destinataire : étape comptée, non marquée (retentée le lendemain)', async () => {
    landRegularizationStepFindMany.mockResolvedValue([baseStep()]);
    roleFindUnique.mockResolvedValue(null);
    tenantFindUnique.mockResolvedValue({ name: 'Agence Koumassi', contactEmail: null });

    const report = await alertOverdueLandSteps(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 1, sent: 0, skippedNoRecipient: 1, skippedAlreadySent: 0, failed: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("repli sur l'e-mail de contact de l'agence sans administrateur actif", async () => {
    landRegularizationStepFindMany.mockResolvedValue([baseStep()]);
    roleFindUnique.mockResolvedValue(null);
    tenantFindUnique.mockResolvedValue({ name: 'Agence Koumassi', contactEmail: 'contact@agence.test' });

    const report = await alertOverdueLandSteps(TENANT, { now: NOW });

    expect(report.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'contact@agence.test' }));
  });

  it('envoi en échec : compté failed, sans marque, sans casser les étapes suivantes', async () => {
    landRegularizationStepFindMany.mockResolvedValue([baseStep(), baseStep({ id: 'step-2' })]);
    sendEmail.mockRejectedValueOnce(new Error('SMTP indisponible')).mockResolvedValueOnce(undefined);

    const report = await alertOverdueLandSteps(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 2, sent: 1, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 1 });
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'step-2::2026-10-05' }));
  });

  it("un échec d'envoi vers un administrateur n'empêche pas les autres, et l'étape compte comme envoyée", async () => {
    mockAdmins(['a@example.com', 'b@example.com']);
    landRegularizationStepFindMany.mockResolvedValue([baseStep()]);
    sendEmail.mockRejectedValueOnce(new Error('boîte pleine')).mockResolvedValueOnce(undefined);

    const report = await alertOverdueLandSteps(TENANT, { now: NOW });

    expect(report).toMatchObject({ sent: 1, failed: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("n'envoie rien et ne lit rien si la notification est désactivée pour l'agence", async () => {
    getEmailNotificationConfig.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });

    const report = await alertOverdueLandSteps(TENANT, { now: NOW });

    expect(report).toEqual({ matched: 0, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 });
    expect(landRegularizationStepFindMany).not.toHaveBeenCalled();
  });

  it("isolation : la requête, l'anti-doublon et les destinataires sont limités au tenant demandé", async () => {
    landRegularizationStepFindMany.mockResolvedValue([baseStep()]);

    await alertOverdueLandSteps('tenant-2', { now: NOW });

    expect(getEmailNotificationConfig).toHaveBeenCalledWith('tenant-2', 'LAND_STEP_OVERDUE_ALERT');
    expect(landRegularizationStepFindMany.mock.calls[0][0].where.tenantId).toBe('tenant-2');
    expect(landRegularizationStepFindMany.mock.calls[0][0].where.regularization.tenantId).toBe('tenant-2');
    expect(auditLogFindMany.mock.calls[0][0].where.tenantId).toBe('tenant-2');
    expect(userRoleFindMany.mock.calls[0][0].where.tenantId).toBe('tenant-2');
    expect(sendEmail.mock.calls[0][0].tenantId).toBe('tenant-2');
    expect(sendEmail.mock.calls[0][0].html).toContain('/tenant/tenant-2/patrimoine/land/reg-1');
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-2' }));
  });

  it('utilise le gabarit personnalisé de l’agence quand il existe', async () => {
    getEmailNotificationConfig.mockResolvedValue({
      enabled: true,
      subjectOverride: 'Retard {{stepLabel}}',
      bodyHtmlOverride: '<p>{{propertyReference}} / {{regularizationUrl}}</p>'
    });
    landRegularizationStepFindMany.mockResolvedValue([baseStep()]);

    await alertOverdueLandSteps(TENANT, { now: NOW });

    const mail = sendEmail.mock.calls[0][0];
    expect(mail.subject).toBe('Retard Bornage contradictoire');
    expect(mail.html).toContain('<p>REF-1 / ');
  });
});
