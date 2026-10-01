/**
 * `jobs/owner-monthly-report-job.ts` — fenêtre, sélection, isolation par agence.
 * `sendOwnerMonthlyReport` et la base sont mockés : aucun envoi, aucun lien.
 */

const tenantFindMany = jest.fn();
const ownerStatementFindMany = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: {
    tenant: { findMany: (...a: any[]) => tenantFindMany(...a) },
    ownerStatement: { findMany: (...a: any[]) => ownerStatementFindMany(...a) }
  }
}));

const sendOwnerMonthlyReport = jest.fn();
jest.mock('../../src/lib/patrimoine/notifications', () => ({
  sendOwnerMonthlyReport: (...a: any[]) => sendOwnerMonthlyReport(...a)
}));

const envMock = { PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED: false };
jest.mock('../../src/config/env', () => ({ env: envMock }));

const schedule = jest.fn();
jest.mock('node-cron', () => ({ schedule: (...a: any[]) => schedule(...a) }));

import {
  previousMonthPeriod,
  runOwnerMonthlyReports,
  startOwnerMonthlyReportJob,
  stopOwnerMonthlyReportJob
} from '../../src/jobs/owner-monthly-report-job';
import { OWNER_STATEMENT_COMPUTATION_VERSION } from '../../src/lib/patrimoine/owner-statement-computation';
import { getCurrentTenantId } from '../../src/utils/tenant-context';

const IN_WINDOW = new Date('2026-10-03T08:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  envMock.PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED = false;
  tenantFindMany.mockResolvedValue([{ id: 'tenant-a' }]);
  ownerStatementFindMany.mockResolvedValue([{ id: 's1' }]);
  sendOwnerMonthlyReport.mockResolvedValue({ sent: true, channel: 'EMAIL' });
  schedule.mockReturnValue({ stop: jest.fn() });
});

afterEach(() => stopOwnerMonthlyReportJob());

describe('previousMonthPeriod', () => {
  it('mois précédent en UTC, janvier bascule sur décembre', () => {
    expect(previousMonthPeriod(new Date('2026-10-03T00:00:00.000Z'))).toBe('2026-09');
    expect(previousMonthPeriod(new Date('2027-01-02T00:00:00.000Z'))).toBe('2026-12');
  });
});

describe('runOwnerMonthlyReports', () => {
  it('hors des 10 premiers jours du mois : aucun effet, aucune lecture', async () => {
    const report = await runOwnerMonthlyReports(new Date('2026-10-11T08:00:00.000Z'));

    expect(report.inWindow).toBe(false);
    expect(tenantFindMany).not.toHaveBeenCalled();
    expect(sendOwnerMonthlyReport).not.toHaveBeenCalled();
  });

  it('le 10 du mois est encore dans la fenêtre', async () => {
    const report = await runOwnerMonthlyReports(new Date('2026-10-10T23:59:00.000Z'));
    expect(report.inWindow).toBe(true);
  });

  it('sélectionne les relevés du mois précédent, hors DRAFT, à la version de calcul courante', async () => {
    await runOwnerMonthlyReports(IN_WINDOW);

    expect(tenantFindMany.mock.calls[0][0].where).toEqual({ status: 'ACTIVE', isActive: true });
    expect(ownerStatementFindMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-a',
      period: '2026-09',
      status: { not: 'DRAFT' },
      computationVersion: OWNER_STATEMENT_COMPUTATION_VERSION
    });
  });

  it('envoie sans force (anti-doublon actif) dans le contexte de l’agence', async () => {
    let seenTenant: string | undefined;
    sendOwnerMonthlyReport.mockImplementation(async () => {
      seenTenant = getCurrentTenantId();
      return { sent: true, channel: 'WHATSAPP' };
    });

    const report = await runOwnerMonthlyReports(IN_WINDOW);

    expect(sendOwnerMonthlyReport).toHaveBeenCalledWith('s1', 'tenant-a');
    expect(sendOwnerMonthlyReport.mock.calls[0]).toHaveLength(2); // pas d'options, donc pas de `force`
    expect(seenTenant).toBe('tenant-a');
    expect(report).toMatchObject({ tenants: 1, statements: 1, sent: 1, failedTenants: 0 });
  });

  it('un relevé déjà envoyé est compté, jamais renvoyé par le job', async () => {
    sendOwnerMonthlyReport.mockResolvedValue({ sent: false, channel: null, reason: 'ALREADY_SENT' });

    const report = await runOwnerMonthlyReports(IN_WINDOW);

    expect(report).toMatchObject({ sent: 0, skippedAlreadySent: 1, skippedNoChannel: 0 });
  });

  it('compte les relevés sans canal éligible', async () => {
    sendOwnerMonthlyReport.mockResolvedValue({ sent: false, channel: null, reason: 'NO_ELIGIBLE_CHANNEL' });

    const report = await runOwnerMonthlyReports(IN_WINDOW);

    expect(report.skippedNoChannel).toBe(1);
  });

  it('compte à part les relevés dont tous les canaux éligibles ont échoué à l’envoi', async () => {
    sendOwnerMonthlyReport.mockResolvedValue({ sent: false, channel: null, reason: 'SEND_FAILED' });

    const report = await runOwnerMonthlyReports(IN_WINDOW);

    expect(report).toMatchObject({ sendFailed: 1, skippedNoChannel: 0, sent: 0 });
  });

  it('un relevé en erreur n’interrompt pas les suivants de la même agence', async () => {
    ownerStatementFindMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }, { id: 's3' }]);
    sendOwnerMonthlyReport.mockImplementation(async (id: string) => {
      if (id === 's2') throw new Error('base indisponible');
      return { sent: true, channel: 'EMAIL' };
    });

    const report = await runOwnerMonthlyReports(IN_WINDOW);

    expect(sendOwnerMonthlyReport).toHaveBeenCalledTimes(3);
    expect(report).toMatchObject({ statements: 3, sent: 2, failedStatements: 1, failedTenants: 0 });
  });

  it('une agence en échec n’arrête pas les suivantes', async () => {
    tenantFindMany.mockResolvedValue([{ id: 'tenant-a' }, { id: 'tenant-b' }]);
    ownerStatementFindMany.mockImplementation(async ({ where }: any) => {
      if (where.tenantId === 'tenant-a') throw new Error('base indisponible');
      return [{ id: 's-b' }];
    });

    const report = await runOwnerMonthlyReports(IN_WINDOW);

    expect(report).toMatchObject({ tenants: 2, failedTenants: 1, sent: 1 });
    expect(sendOwnerMonthlyReport).toHaveBeenCalledWith('s-b', 'tenant-b');
  });
});

describe('startOwnerMonthlyReportJob', () => {
  it('désactivé (défaut) : aucune planification', () => {
    startOwnerMonthlyReportJob();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('activé : cron quotidien à 8 h UTC, une seule planification', () => {
    envMock.PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED = true;

    startOwnerMonthlyReportJob();
    startOwnerMonthlyReportJob();

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0][0]).toBe('0 8 * * *');
    expect(schedule.mock.calls[0][2]).toEqual({ timezone: 'UTC' });
  });
});
