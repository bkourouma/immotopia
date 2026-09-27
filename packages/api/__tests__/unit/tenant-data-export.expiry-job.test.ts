/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot S7 — tache horaire d'expiration des archives d'export : elle expire les
 * archives de TOUTES les agences et libere les RUNNING bloques (6 h), sans
 * jamais laisser une erreur remonter au planificateur.
 */

const expireMock = jest.fn();
const staleMock = jest.fn();
jest.mock('../../src/services/tenant-data-export/export-service', () => ({
  STALE_RUNNING_AGE_MS: 6 * 3600 * 1000,
  expireOldExports: (...a: any[]) => expireMock(...a),
  failStaleRunningExports: (...a: any[]) => staleMock(...a)
}));

const scheduleMock = jest.fn(() => ({ stop: jest.fn() }));
jest.mock('node-cron', () => ({ schedule: (...a: any[]) => (scheduleMock as any)(...a) }));

import {
  runTenantDataExportMaintenance,
  startTenantDataExportExpiryJob,
  stopTenantDataExportExpiryJob
} from '../../src/jobs/tenant-data-export-expiry-job';

beforeEach(() => {
  jest.clearAllMocks();
  expireMock.mockResolvedValue(2);
  staleMock.mockResolvedValue(0);
});

describe('Tache d’expiration des exports', () => {
  it('expire pour toutes les agences et libere les RUNNING de plus de 6 heures', async () => {
    const now = new Date('2026-09-29T12:00:00Z');
    await runTenantDataExportMaintenance(now);
    expect(expireMock).toHaveBeenCalledWith(undefined, now);
    expect(staleMock).toHaveBeenCalledWith(6 * 3600 * 1000, now);
  });

  it('avale une erreur plutot que de casser le planificateur', async () => {
    expireMock.mockRejectedValue(new Error('base indisponible'));
    await expect(runTenantDataExportMaintenance()).resolves.toBeUndefined();
  });

  it('se planifie une fois par heure, une seule fois', () => {
    startTenantDataExportExpiryJob();
    startTenantDataExportExpiryJob();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect((scheduleMock.mock.calls[0] as any[])[0]).toBe('40 * * * *');
    stopTenantDataExportExpiryJob();
  });
});
