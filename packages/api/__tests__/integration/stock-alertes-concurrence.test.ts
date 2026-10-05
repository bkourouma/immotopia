/**
 * Alertes de stock sous concurrence (lot 040, spec B7-R2, B7-R6 ; critères
 * B7-3 et B7-5), prouvées sur une base PostgreSQL réelle : des doublures ne
 * prouvent ni un `ON CONFLICT DO NOTHING` ni une mise à jour conditionnelle.
 *
 * 1. Deux naissances simultanées de la même clé (cumul du mois) : aucune
 *    erreur d'unicité, une seule ligne (B7-5).
 * 2. Deux réclamations simultanées : jamais la même alerte des deux côtés.
 * 3. Deux passages simultanés de la tâche d'envoi : un seul e-mail par alerte
 *    et par destinataire ; un échec SMTP laisse `email_sent_at` nul (B7-3).
 *
 * Base : DÉDIÉE (`DATABASE_URL_TEST`), jamais celle de développement. Absente
 * ou différente de `DATABASE_URL` → la suite est ignorée (`describe.skip`).
 * Lancée par `npm run test:isolation` une fois ajoutée au lanceur
 * (`__tests__/helpers/run-isolation-tests.js`, intégration).
 */
import { randomUUID } from 'crypto';
import { prisma } from '../../src/utils/database';
import { cleanupTenants, createTestTenant, createTenantMemberUser } from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log(
    'DATABASE_URL_TEST absente (ou différente de DATABASE_URL) : stock-alertes-concurrence.test.ts est ignorée.'
  );
}

const sendEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...args: any[]) => sendEmail(...args) }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: () => undefined,
  recordAuditEvent: async () => undefined
}));

import { raiseStockAlertTx, alertKeys } from '../../src/lib/finance/stock-alertes';
import { claimStockAlertsForMail, runStockAlertMail } from '../../src/jobs/stock-maintenance-job';

maybeDescribe('alertes de stock — concurrence (base réelle)', () => {
  const tenantIds: string[] = [];
  let tenantId: string;

  beforeAll(async () => {
    const tenant = await createTestTenant('Stock alertes');
    tenantId = tenant.id;
    tenantIds.push(tenantId);
    await createTenantMemberUser(tenant, 'responsable-stock', `TEST_STOCK_ALERTS_${randomUUID().slice(0, 8)}`, [
      'STOCK_ALERTS_VIEW',
      'STOCK_VALUES_VIEW'
    ]);
  });

  afterAll(async () => {
    await cleanupTenants(tenantIds);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    sendEmail.mockReset();
    await prisma.stockAlert.deleteMany({ where: { tenantId } });
  });

  /** Envois de CETTE agence (la base de test peut porter les alertes d'autres suites). */
  function sendsForTenant(): number {
    return sendEmail.mock.calls.filter(call => call[0]?.tenantId === tenantId).length;
  }

  function alertInput(dedupeKey: string) {
    return {
      tenantId,
      kind: 'CASH_MATERIAL_PURCHASE' as const,
      severity: 'WARNING' as const,
      dedupeKey,
      amount: 120000,
      threshold: 100000,
      subjectType: 'CashVoucher' as const,
      subjectId: randomUUID(),
      details: { mode: 'MONTHLY_CUMUL' }
    };
  }

  it('B7-5 : deux naissances simultanées de la même clé → aucune erreur, une seule alerte', async () => {
    const key = alertKeys.cashMaterialCumul(randomUUID(), '2026-10');
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => prisma.$transaction(tx => raiseStockAlertTx(tx, alertInput(key))))
    );
    expect(results.every(result => result.status === 'fulfilled')).toBe(true);
    expect(await prisma.stockAlert.count({ where: { tenantId, dedupeKey: key } })).toBe(1);
  });

  it('deux réclamations simultanées ne prennent jamais la même alerte', async () => {
    for (let i = 0; i < 20; i += 1) {
      await prisma.$transaction(tx => raiseStockAlertTx(tx, alertInput(`TEST:${randomUUID()}`)));
    }
    const now = new Date();
    const [a, b] = await Promise.all([claimStockAlertsForMail(tenantId, now), claimStockAlertsForMail(tenantId, now)]);
    const overlap = a.filter(id => b.includes(id));
    expect(overlap).toEqual([]);
    expect(a.length + b.length).toBe(20);
  });

  it('B7-3 : deux passages simultanés → un seul e-mail ; un échec SMTP laisse emailSentAt nul', async () => {
    for (let i = 0; i < 3; i += 1) {
      await prisma.$transaction(tx => raiseStockAlertTx(tx, alertInput(`TEST:${randomUUID()}`)));
    }
    sendEmail.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    await Promise.all([runStockAlertMail(), runStockAlertMail()]);
    expect(sendsForTenant()).toBe(1);
    expect(await prisma.stockAlert.count({ where: { tenantId, emailSentAt: null } })).toBe(0);

    await prisma.$transaction(tx => raiseStockAlertTx(tx, alertInput(`TEST:${randomUUID()}`)));
    sendEmail.mockReset();
    sendEmail.mockRejectedValue(new Error('SMTP indisponible'));
    await runStockAlertMail();
    const pending = await prisma.stockAlert.findMany({
      where: { tenantId, emailSentAt: null },
      select: { emailClaimedAt: true }
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].emailClaimedAt).not.toBeNull();

    // Encore réclamée : un passage immédiat ne la reprend pas.
    sendEmail.mockReset();
    sendEmail.mockResolvedValue(undefined);
    await runStockAlertMail();
    expect(sendsForTenant()).toBe(0);

    // 31 minutes plus tard, elle repart.
    await runStockAlertMail(new Date(Date.now() + 31 * 60 * 1000));
    expect(sendsForTenant()).toBe(1);
    expect(await prisma.stockAlert.count({ where: { tenantId, emailSentAt: null } })).toBe(0);
  });
});
