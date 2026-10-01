/**
 * Rétention du journal d'audit : dates limites (minuit UTC) et boucle de purge
 * par lots, avec la trace `AUDIT_PURGED` écrite dans la même transaction.
 */
const queryRaw = jest.fn();
const recordAuditEvent = jest.fn();
const tx = { $queryRaw: (...a: unknown[]) => queryRaw(...a) };

jest.mock('../../src/utils/database', () => ({
  prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) }
}));
jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: (...a: unknown[]) => recordAuditEvent(...a)
}));
jest.mock('../../src/services/audit-integrity-service', () => ({
  startOfUtcDay: (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}));

import {
  currentRetentionCutoffs,
  purgeExpiredAuditRows,
  retentionCutoff
} from '../../src/services/audit-retention-service';
import { env } from '../../src/config/env';

const NOW = new Date('2026-10-15T13:45:00.000Z');

beforeEach(() => {
  queryRaw.mockReset();
  recordAuditEvent.mockReset();
});

describe('retentionCutoff', () => {
  it('recule de N mois et tombe à minuit UTC', () => {
    expect(retentionCutoff(NOW, 24).toISOString()).toBe('2024-10-15T00:00:00.000Z');
    expect(retentionCutoff(NOW, 7).toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  it('currentRetentionCutoffs applique les durées de l’environnement, une par visibilité', () => {
    const cutoffs = currentRetentionCutoffs(NOW);
    expect(cutoffs.tenant).toEqual(retentionCutoff(NOW, env.AUDIT_RETENTION_TENANT_MONTHS));
    expect(cutoffs.platform).toEqual(retentionCutoff(NOW, env.AUDIT_RETENTION_PLATFORM_MONTHS));
    expect(cutoffs.platform.getTime()).toBeLessThanOrEqual(cutoffs.tenant.getTime());
  });
});

describe('purgeExpiredAuditRows', () => {
  it('purge chaque visibilité avec sa date limite et trace chaque lot non vide', async () => {
    queryRaw.mockResolvedValueOnce([{ deleted: 12 }]).mockResolvedValueOnce([{ deleted: 0 }]);

    const result = await purgeExpiredAuditRows(NOW);

    expect(result).toEqual({ deleted: { TENANT: 12, PLATFORM_ONLY: 0 }, moreToPurge: false });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    // Un lot de 12 < 5000 : un seul passage par visibilité, une seule trace.
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actionKey: 'AUDIT_PURGED',
        payload: expect.objectContaining({ visibility: 'TENANT', deleted: 12 })
      })
    );
  });

  it('enchaîne les lots tant qu’un lot est plein', async () => {
    queryRaw
      .mockResolvedValueOnce([{ deleted: 5000 }])
      .mockResolvedValueOnce([{ deleted: 30 }])
      .mockResolvedValueOnce([{ deleted: 0 }]);

    const result = await purgeExpiredAuditRows(NOW);

    expect(result.deleted.TENANT).toBe(5030);
    expect(recordAuditEvent).toHaveBeenCalledTimes(2);
  });

  it('une erreur SQL (garde-fou de la fonction) remonte sans trace', async () => {
    queryRaw.mockRejectedValueOnce(new Error('audit_logs_purge : date limite trop recente'));
    await expect(purgeExpiredAuditRows(NOW)).rejects.toThrow('trop recente');
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});
