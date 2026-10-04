/**
 * Tâche de maintenance du stock (lot 040, spec B7-R6, B3-R2).
 *
 * Aucune base : la réclamation conditionnelle (`UPDATE … RETURNING`) est
 * simulée par une doublure qui applique la même règle (non envoyée, et non
 * réclamée ou réclamée depuis plus de 30 minutes). Deux passages simultanés
 * sont prouvés sur une vraie base par
 * `__tests__/integration/stock-alertes-concurrence.test.ts`.
 *
 * Prouvé ici : envoi puis marquage, échec SMTP qui laisse `emailSentAt` nul
 * et repart après 30 minutes (B7-3), alertes sans objet marquées avec leur
 * raison (B7-6), destinataires lus en base avec les DEUX droits, récapitulatif
 * sans nom de personne, purge des clés de plus de 30 jours.
 */

type Row = Record<string, any>;

const store = {
  alerts: [] as Row[],
  userRoles: [] as Row[],
  users: [] as Row[]
};

const sendEmail = jest.fn();
const getEmailNotificationConfig = jest.fn();
const getEntitlements = jest.fn();
const evaluateFeatureAccess = jest.fn();
const executeRaw = jest.fn();

jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...args: any[]) => sendEmail(...args) }
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...args: any[]) => getEmailNotificationConfig(...args)
}));
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: (...args: any[]) => getEntitlements(...args)
}));
jest.mock('../../src/lib/subscription/feature-access', () => ({
  evaluateFeatureAccess: (...args: any[]) => evaluateFeatureAccess(...args)
}));
jest.mock('../../src/lib/finance/cash', () => ({ formatCashVoucherNumber: () => null }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

function sqlOf(strings: TemplateStringsArray): string {
  return strings.join('?');
}

const prismaMock: Row = {
  stockAlert: {
    findMany: jest.fn(async ({ where, distinct }: Row) => {
      let rows = store.alerts;
      if (where?.emailSentAt === null) rows = rows.filter(a => a.emailSentAt === null);
      if (where?.tenantId) rows = rows.filter(a => a.tenantId === where.tenantId);
      if (where?.id?.in) rows = rows.filter(a => where.id.in.includes(a.id));
      if (distinct) {
        const seen = new Set<string>();
        rows = rows.filter(a => (seen.has(a.tenantId) ? false : (seen.add(a.tenantId), true)));
      }
      return rows.map(a => ({
        ...a,
        site: null,
        location: a.locationLabel ? { id: a.locationId, label: a.locationLabel } : null,
        acknowledgedBy: null
      }));
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.alerts.filter(a => a.tenantId === where.tenantId && where.id.in.includes(a.id));
      rows.forEach(a => Object.assign(a, data));
      return { count: rows.length };
    })
  },
  userRole: {
    findMany: jest.fn(async ({ where }: Row) => store.userRoles.filter(link => link.tenantId === where.tenantId))
  },
  user: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.users.filter(
        u =>
          where.id.in.includes(u.id) &&
          u.isActive === where.isActive &&
          u.memberships.some((m: Row) => m.tenantId === where.memberships.some.tenantId && m.status === 'ACTIVE')
      )
    )
  },
  tenant: {
    findUnique: jest.fn(async () => ({ name: 'Agence Kaporo' }))
  },
  /** Réclamation conditionnelle, même règle que le SQL de la tâche. */
  $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
    const sql = sqlOf(strings);
    if (!sql.includes('UPDATE stock_alerts')) return [];
    const [claimedAt, tenantId, expiredBefore] = values as [string, string, string];
    const claimed = store.alerts.filter(
      a =>
        a.tenantId === tenantId &&
        a.emailSentAt === null &&
        (a.emailClaimedAt === null || a.emailClaimedAt.getTime() < new Date(expiredBefore).getTime())
    );
    claimed.forEach(a => {
      a.emailClaimedAt = new Date(claimedAt);
    });
    return claimed.map(a => ({ id: a.id }));
  }),
  $executeRaw: (...args: any[]) => executeRaw(...args)
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop: string) => (prismaMock as any)[prop] })
}));

import {
  buildStockAlertSummaryLines,
  purgeStockClientRequests,
  resolveStockAlertRecipients,
  runStockAlertMail
} from '../../src/jobs/stock-maintenance-job';

const TENANT = 'tenant-1';
const NOW = new Date('2026-10-04T10:00:00.000Z');

function seedAlert(overrides: Row = {}): Row {
  const alert = {
    id: `alert-${store.alerts.length + 1}`,
    tenantId: TENANT,
    kind: 'LARGE_ISSUE',
    severity: 'WARNING',
    status: 'OPEN',
    amount: 600000,
    threshold: 500000,
    currency: 'XOF',
    siteId: null,
    locationId: 'loc-1',
    locationLabel: 'Magasin central',
    subjectType: 'StockSlip',
    subjectId: 'slip-1',
    details: null,
    raisedAt: new Date('2026-10-04T09:00:00.000Z'),
    acknowledgedAt: null,
    acknowledgeNote: null,
    emailClaimedAt: null,
    emailSentAt: null,
    emailSkippedReason: null,
    ...overrides
  };
  store.alerts.push(alert);
  return alert;
}

function seedRecipient(id: string, keys: string[], overrides: Row = {}): void {
  store.userRoles.push({
    tenantId: TENANT,
    userId: id,
    role: { permissions: keys.map(key => ({ permission: { key } })) }
  });
  store.users.push({
    id,
    email: `${id}@example.ci`,
    preferredLanguage: null,
    isActive: true,
    memberships: [{ tenantId: TENANT, status: 'ACTIVE' }],
    ...overrides
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  store.alerts = [];
  store.userRoles = [];
  store.users = [];
  sendEmail.mockResolvedValue(undefined);
  getEmailNotificationConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  getEntitlements.mockResolvedValue({ enforcement: 'off' });
  evaluateFeatureAccess.mockReturnValue({ allowed: true });
  executeRaw.mockResolvedValue(3);
});

describe('runStockAlertMail (B7-R6)', () => {
  it('envoie un récapitulatif par agence aux seuls détenteurs des deux droits, puis marque les alertes', async () => {
    seedAlert();
    seedAlert({ kind: 'RECEIPT_UNVALUED', severity: 'INFO', amount: null, threshold: null });
    seedRecipient('admin', ['STOCK_ALERTS_VIEW', 'STOCK_VALUES_VIEW']);
    seedRecipient('magasinier', ['STOCK_VIEW', 'STOCK_ALERTS_VIEW']);
    seedRecipient('ancien', ['STOCK_ALERTS_VIEW', 'STOCK_VALUES_VIEW'], { isActive: false });

    const report = await runStockAlertMail(NOW);

    expect(report).toMatchObject({ tenants: 1, claimed: 2, sent: 2, failed: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('admin@example.ci');
    expect(mail.subject).toBe('Alertes de stock à traiter - Agence Kaporo');
    expect(mail.html).toContain('Sortie importante — Magasin central — 600');
    expect(mail.html).toContain('Réception sans prix connu');
    expect(mail.html).toContain('/tenant/tenant-1/finance/stock/controle');
    expect(mail.html).not.toMatch(/\{\{/);
    expect(store.alerts.every(a => a.emailSentAt?.getTime() === NOW.getTime() && a.emailSkippedReason === null)).toBe(
      true
    );
  });

  it('échec SMTP : emailSentAt reste nul, l’alerte n’est pas reprise avant 30 minutes, puis repart (B7-3)', async () => {
    seedAlert();
    seedRecipient('admin', ['STOCK_ALERTS_VIEW', 'STOCK_VALUES_VIEW']);
    sendEmail.mockRejectedValueOnce(new Error('SMTP indisponible'));

    const first = await runStockAlertMail(NOW);
    expect(first).toMatchObject({ claimed: 1, sent: 0, failed: 1 });
    expect(store.alerts[0].emailSentAt).toBeNull();

    const tooSoon = await runStockAlertMail(new Date(NOW.getTime() + 10 * 60 * 1000));
    expect(tooSoon.claimed).toBe(0);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const later = await runStockAlertMail(new Date(NOW.getTime() + 31 * 60 * 1000));
    expect(later).toMatchObject({ claimed: 1, sent: 1 });
    expect(store.alerts[0].emailSentAt).not.toBeNull();
  });

  it('deux passages successifs n’envoient qu’une fois la même alerte', async () => {
    seedAlert();
    seedRecipient('admin', ['STOCK_ALERTS_VIEW', 'STOCK_VALUES_VIEW']);
    await runStockAlertMail(NOW);
    await runStockAlertMail(new Date(NOW.getTime() + 60 * 60 * 1000));
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('clé désactivée : DISABLED au premier passage, puis plus relue (B7-6)', async () => {
    seedAlert();
    seedRecipient('admin', ['STOCK_ALERTS_VIEW', 'STOCK_VALUES_VIEW']);
    getEmailNotificationConfig.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });

    const report = await runStockAlertMail(NOW);
    expect(report.skipped.DISABLED).toBe(1);
    expect(store.alerts[0]).toMatchObject({ emailSkippedReason: 'DISABLED' });
    expect(store.alerts[0].emailSentAt).not.toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();

    const next = await runStockAlertMail(new Date(NOW.getTime() + 60 * 60 * 1000));
    expect(next.tenants).toBe(0);
  });

  it('CONSTRUCTION absente en mode enforce : NO_FEATURE', async () => {
    seedAlert();
    seedRecipient('admin', ['STOCK_ALERTS_VIEW', 'STOCK_VALUES_VIEW']);
    getEntitlements.mockResolvedValue({ enforcement: 'enforce' });
    evaluateFeatureAccess.mockReturnValue({ allowed: false });

    const report = await runStockAlertMail(NOW);
    expect(report.skipped.NO_FEATURE).toBe(1);
    expect(store.alerts[0].emailSkippedReason).toBe('NO_FEATURE');
  });

  it('aucun destinataire : NO_RECIPIENT', async () => {
    seedAlert();
    seedRecipient('magasinier', ['STOCK_VIEW']);
    const report = await runStockAlertMail(NOW);
    expect(report.skipped.NO_RECIPIENT).toBe(1);
    expect(store.alerts[0].emailSkippedReason).toBe('NO_RECIPIENT');
  });

  it('une agence en échec n’empêche pas les suivantes', async () => {
    seedAlert({ tenantId: 'tenant-casse' });
    seedAlert();
    seedRecipient('admin', ['STOCK_ALERTS_VIEW', 'STOCK_VALUES_VIEW']);
    getEmailNotificationConfig.mockImplementation(async (tenantId: string) => {
      if (tenantId === 'tenant-casse') throw new Error('lecture impossible');
      return { enabled: true, subjectOverride: null, bodyHtmlOverride: null };
    });
    const report = await runStockAlertMail(NOW);
    expect(report.failedTenants).toBe(1);
    expect(report.sent).toBe(1);
  });
});

describe('destinataires et récapitulatif', () => {
  it('lit les rôles en base, jamais le cache : membre actif, compte actif, deux droits', async () => {
    seedRecipient('admin', ['STOCK_ALERTS_VIEW', 'STOCK_VALUES_VIEW'], { preferredLanguage: 'en' });
    seedRecipient('parti', ['STOCK_ALERTS_VIEW', 'STOCK_VALUES_VIEW'], {
      memberships: [{ tenantId: TENANT, status: 'SUSPENDED' }]
    });
    const recipients = await resolveStockAlertRecipients(TENANT);
    expect(recipients).toEqual([{ email: 'admin@example.ci', language: 'en' }]);
  });

  it('une ligne par alerte : titre, lieu, montant ; aucun nom de personne', () => {
    const lines = buildStockAlertSummaryLines([
      {
        kind: 'COUNT_SELF_VALIDATED',
        amount: null,
        currency: 'XOF',
        location: { id: 'loc-1', label: 'Magasin central' },
        site: null
      } as any
    ]);
    expect(lines).toEqual(['Inventaire validé par son compteur — Magasin central']);
  });
});

describe('purgeStockClientRequests (B3-R2)', () => {
  it('supprime les clés de plus de 30 jours', async () => {
    const deleted = await purgeStockClientRequests(NOW);
    expect(deleted).toBe(3);
    const [strings, cutoff] = executeRaw.mock.calls[0];
    expect(sqlOf(strings)).toContain('DELETE FROM stock_client_requests');
    expect(cutoff).toBe('2026-09-04T10:00:00.000Z');
  });
});
