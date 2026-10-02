/**
 * Contrôleurs `GET /admin/audit` et `GET /admin/audit/export` : paramètres
 * stricts, trace de consultation, en-têtes d'export.
 */
import express from 'express';
import request from 'supertest';

const getPlatformAuditLogs = jest.fn();
const prepare = jest.fn();
const stream = jest.fn();
const logAuditEvent = jest.fn();
const verifyIntegrity = jest.fn();

jest.mock('../../src/services/audit-integrity-service', () => ({
  verifyAuditIntegrity: (...a: unknown[]) => verifyIntegrity(...a)
}));
jest.mock('../../src/services/audit-retention-service', () => ({
  currentRetentionCutoffs: () => ({ tenant: new Date('2024-10-01'), platform: new Date('2021-10-01') })
}));
jest.mock('../../src/services/audit-platform-read-service', () => ({
  getPlatformAuditLogs: (...a: unknown[]) => getPlatformAuditLogs(...a)
}));
jest.mock('../../src/services/audit-platform-export-service', () => ({
  preparePlatformAuditExport: (...a: unknown[]) => prepare(...a),
  streamPlatformAuditCsv: (...a: unknown[]) => stream(...a)
}));
jest.mock('../../src/services/audit-service', () => ({
  ...jest.requireActual('../../src/types/audit-types'),
  logAuditEvent: (...a: unknown[]) => logAuditEvent(...a)
}));

import {
  exportAuditLogsHandler,
  getAuditIntegrityHandler,
  getAuditLogsHandler
} from '../../src/controllers/audit-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.get('/audit', getAuditLogsHandler);
app.get('/audit/export', exportAuditLogsHandler);
app.get('/audit/integrity', getAuditIntegrityHandler);
app.use(errorHandler);

beforeEach(() => {
  [getPlatformAuditLogs, prepare, stream, logAuditEvent, verifyIntegrity].forEach(m => m.mockReset());
  getPlatformAuditLogs.mockResolvedValue({ logs: [], nextCursor: null });
  prepare.mockResolvedValue({ rows: 3, truncated: false });
  stream.mockImplementation(async (_filters: unknown, out: any) => {
    out.write('a;b\r\n');
    out.end();
  });
});

describe('GET /audit', () => {
  it('renvoie la page et transmet les filtres lus', async () => {
    const res = await request(app).get(
      '/audit?tenantId=t1&category=SECURITY&startDate=2026-09-01&endDate=2026-09-30&limit=20'
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { logs: [], nextCursor: null } });
    const filters = getPlatformAuditLogs.mock.calls[0][0];
    expect(filters).toMatchObject({ tenantId: 't1', category: 'SECURITY', limit: 20 });
    expect(filters.endDate.toISOString()).toBe('2026-09-30T23:59:59.999Z');
  });

  it.each([
    '?page=2',
    '?action=PROPERTY_CREATED',
    '?resourceType=PROPERTY',
    '?userId=u1',
    '?limit=0',
    '?limit=101',
    '?category=NOPE',
    '?requestId=a b',
    '?actionKey=minuscule',
    '?startDate=hier'
  ])('paramètre refusé en 400 : %s', async query => {
    const res = await request(app).get(`/audit${query}`);
    expect(res.status).toBe(400);
    expect(getPlatformAuditLogs).not.toHaveBeenCalled();
  });

  it('trace la consultation sur la première page seulement', async () => {
    await request(app).get('/audit?category=AUTH&limit=10');
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent.mock.calls[0][0]).toMatchObject({
      actionKey: 'AUDIT_VIEWED',
      entityId: 'platform',
      payload: { level: 'PLATFORM', filters: { category: 'AUTH' } }
    });
    expect(logAuditEvent.mock.calls[0][0].payload.filters).not.toHaveProperty('limit');

    logAuditEvent.mockReset();
    await request(app).get('/audit?cursor=abc');
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe('GET /audit/export', () => {
  it('prépare l’export (trace) AVANT le flux, avec les bons en-têtes', async () => {
    const order: string[] = [];
    prepare.mockImplementation(async () => {
      order.push('prepare');
      return { rows: 3, truncated: false };
    });
    stream.mockImplementation(async (_f: unknown, out: any) => {
      order.push('stream');
      out.end('x');
    });

    const res = await request(app).get('/audit/export?category=AUTH');
    expect(res.status).toBe(200);
    expect(order).toEqual(['prepare', 'stream']);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="journal-audit-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers['x-export-truncated']).toBe('false');
    expect(res.headers['x-export-rows']).toBe('3');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['access-control-expose-headers']).toContain('X-Export-Truncated');
  });

  it('signale la troncature', async () => {
    prepare.mockResolvedValue({ rows: 50_000, truncated: true });
    const res = await request(app).get('/audit/export');
    expect(res.headers['x-export-truncated']).toBe('true');
  });

  it.each(['?cursor=abc', '?limit=10', '?page=1'])(
    'refuse %s (ni curseur ni taille de page à l’export)',
    async query => {
      const res = await request(app).get(`/audit/export${query}`);
      expect(res.status).toBe(400);
      expect(prepare).not.toHaveBeenCalled();
    }
  );

  it('si la trace échoue, aucun fichier n’est envoyé', async () => {
    prepare.mockRejectedValue(new Error('journal indisponible'));
    const res = await request(app).get('/audit/export');
    expect(res.status).toBe(500);
    expect(stream).not.toHaveBeenCalled();
    expect(res.headers['content-type']).not.toContain('text/csv');
  });
});

describe('GET /audit/integrity', () => {
  const report = { ok: true, chain: { ok: true, sealsChecked: 0, head: null }, partitions: { checked: 0 } };

  it('transmet la période (jours UTC) et les durées de rétention, trace la consultation', async () => {
    verifyIntegrity.mockResolvedValue(report);
    const res = await request(app).get('/audit/integrity?from=2026-09-01&to=2026-09-30');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: report });
    const options = verifyIntegrity.mock.calls[0][0];
    expect(options.from).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    expect(options.to).toEqual(new Date('2026-09-30T00:00:00.000Z'));
    expect(options.cutoffs.tenant).toEqual(new Date('2024-10-01'));
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'AUDIT_VIEWED', payload: expect.objectContaining({ integrity: true }) })
    );
  });

  it.each([['?foo=1'], ['?from=hier'], ['?from=2026-10-01&to=2026-09-01'], ['?from=2026-02-31']])(
    'refuse %s en 400 sans rien calculer',
    async query => {
      const res = await request(app).get(`/audit/integrity${query}`);
      expect(res.status).toBe(400);
      expect(verifyIntegrity).not.toHaveBeenCalled();
    }
  );
});
