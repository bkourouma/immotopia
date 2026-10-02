/**
 * Job quotidien du journal d'audit : scellement toujours, purge seulement si
 * `AUDIT_PURGE_ENABLED`, alerte si la vérification échoue, étapes indépendantes.
 */
const seal = jest.fn();
const verify = jest.fn();
const head = jest.fn();
const purge = jest.fn();
const logAuditEvent = jest.fn();
const flush = jest.fn();
const loggerError = jest.fn();
const envMock = { AUDIT_PURGE_ENABLED: false };

jest.mock('../../src/config/env', () => ({ env: envMock }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: (...a: unknown[]) => loggerError(...a) }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: unknown[]) => logAuditEvent(...a),
  flushAuditEvents: (...a: unknown[]) => flush(...a)
}));
jest.mock('../../src/services/audit-integrity-service', () => ({
  sealPendingPartitions: (...a: unknown[]) => seal(...a),
  verifyAuditIntegrity: (...a: unknown[]) => verify(...a),
  getAuditChainHead: (...a: unknown[]) => head(...a)
}));
jest.mock('../../src/services/audit-retention-service', () => ({
  currentRetentionCutoffs: () => ({ tenant: new Date(0), platform: new Date(0) }),
  purgeExpiredAuditRows: (...a: unknown[]) => purge(...a)
}));
jest.mock('node-cron', () => ({ schedule: jest.fn(() => ({ stop: jest.fn() })) }));

import { runAuditMaintenance } from '../../src/jobs/audit-maintenance-job';

const okReport = {
  ok: true,
  chain: { ok: true, sealsChecked: 1, head: { seq: 1, sealDate: '2026-10-01', chainHash: 'h' } },
  partitions: { checked: 1, ok: 1, expired: 0, lateRows: [], tampered: [], truncated: false }
};

beforeEach(() => {
  [seal, verify, head, purge, logAuditEvent, flush, loggerError].forEach(m => m.mockReset());
  envMock.AUDIT_PURGE_ENABLED = false;
  seal.mockResolvedValue({ sealed: 2, skipped: 0, failed: 0, moreToSeal: false });
  verify.mockResolvedValue(okReport);
  purge.mockResolvedValue({ deleted: { TENANT: 0, PLATFORM_ONLY: 0 }, moreToPurge: false });
  flush.mockResolvedValue(0);
});

describe('runAuditMaintenance', () => {
  it('scelle, vérifie, et NE purge PAS par défaut', async () => {
    await runAuditMaintenance(new Date('2026-10-15T02:30:00Z'));

    expect(seal).toHaveBeenCalledTimes(1);
    expect(purge).not.toHaveBeenCalled();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ actionKey: 'AUDIT_SEALED' }));
    expect(flush).toHaveBeenCalled();
  });

  it('purge quand AUDIT_PURGE_ENABLED est vrai', async () => {
    envMock.AUDIT_PURGE_ENABLED = true;
    await runAuditMaintenance();
    expect(purge).toHaveBeenCalledTimes(1);
  });

  it('n’écrit pas AUDIT_SEALED quand rien n’a été scellé', async () => {
    seal.mockResolvedValue({ sealed: 0, skipped: 0, failed: 0, moreToSeal: false });
    await runAuditMaintenance();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('journalise une alerte et un AUDIT_INTEGRITY_FAILED si la vérification échoue', async () => {
    verify.mockResolvedValue({
      ...okReport,
      ok: false,
      chain: { ...okReport.chain, ok: false, brokenAtSeq: 7 },
      partitions: { ...okReport.partitions, tampered: [{ status: 'ALTERED' }] }
    });
    await runAuditMaintenance();

    expect(loggerError).toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'AUDIT_INTEGRITY_FAILED',
        payload: { chainOk: false, brokenAtSeq: 7, tamperedPartitions: 1 }
      })
    );
  });

  it('une étape en échec n’empêche pas les suivantes', async () => {
    seal.mockRejectedValue(new Error('base indisponible'));
    await expect(runAuditMaintenance()).resolves.toBeUndefined();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalled();
  });
});
