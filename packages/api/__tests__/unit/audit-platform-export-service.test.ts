/**
 * Export CSV de la plateforme (ADR-006, phase 4) : la trace précède toujours les
 * données, le plafond est signalé, le flux supporte contre-pression et coupure.
 */
import { PassThrough, Writable } from 'stream';

const recordAuditEvent = jest.fn();
const countLogs = jest.fn();
const iterate = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: { __isPrisma: true } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: (...a: unknown[]) => recordAuditEvent(...a)
}));
jest.mock('../../src/services/audit-platform-read-service', () => ({
  PLATFORM_AUDIT_EXPORT_MAX_ROWS: 50_000,
  countPlatformAuditLogs: (...a: unknown[]) => countLogs(...a),
  iteratePlatformAuditLogs: (...a: unknown[]) => iterate(...a)
}));

import { preparePlatformAuditExport, streamPlatformAuditCsv } from '../../src/services/audit-platform-export-service';

const log = (id: string) => ({
  id,
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  action: 'PROPERTY_CREATED',
  category: 'DATA',
  outcome: 'SUCCESS',
  scope: 'TENANT',
  visibility: 'TENANT',
  actorType: 'USER',
  resourceType: 'PROPERTY',
  resourceId: id
});

async function* batches(...lists: string[][]) {
  for (const ids of lists) yield ids.map(log);
}

function collect(stream: PassThrough): Promise<string> {
  return new Promise(resolve => {
    let data = '';
    stream.on('data', chunk => (data += chunk));
    stream.on('end', () => resolve(data));
  });
}

beforeEach(() => {
  [recordAuditEvent, countLogs, iterate].forEach(m => m.mockReset());
  recordAuditEvent.mockResolvedValue(undefined);
});

describe('preparePlatformAuditExport', () => {
  it('écrit la trace AUDIT_EXPORTED avec les filtres et le nombre de lignes', async () => {
    countLogs.mockResolvedValue(1200);
    const plan = await preparePlatformAuditExport({ category: 'SECURITY' });

    expect(plan).toEqual({ rows: 1200, truncated: false });
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent.mock.calls[0][1]).toMatchObject({
      actionKey: 'AUDIT_EXPORTED',
      entityType: 'AuditLog',
      entityId: 'platform',
      payload: { level: 'PLATFORM', filters: { category: 'SECURITY' }, rows: 1200, truncated: false }
    });
  });

  it('signale une troncature au-delà de 50 000 lignes et plafonne le nombre annoncé', async () => {
    countLogs.mockResolvedValue(80_000);
    expect(await preparePlatformAuditExport({})).toEqual({ rows: 50_000, truncated: true });
    expect(recordAuditEvent.mock.calls[0][1].payload).toMatchObject({ rows: 50_000, truncated: true });
  });

  it('sans trace, pas d’export : l’échec d’écriture remonte et rien n’est lu', async () => {
    countLogs.mockResolvedValue(10);
    recordAuditEvent.mockRejectedValue(new Error('journal indisponible'));
    await expect(preparePlatformAuditExport({})).rejects.toThrow('journal indisponible');
    expect(iterate).not.toHaveBeenCalled();
  });
});

describe('streamPlatformAuditCsv', () => {
  it('écrit le BOM, l’en-tête puis chaque lot, et termine le flux', async () => {
    iterate.mockReturnValue(batches(['a', 'b'], ['c']));
    const out = new PassThrough();
    const text = collect(out);
    await streamPlatformAuditCsv({}, out);

    const content = await text;
    expect(content.charCodeAt(0)).toBe(0xfeff);
    const lines = content.trimEnd().split('\r\n');
    expect(lines).toHaveLength(1 + 3);
    expect(lines[0]).toContain('Date,Agence');
    expect(lines.slice(1).map(l => l.split(',')[11])).toEqual(['a', 'b', 'c']);
  });

  it('attend le vidage du tampon quand le client lit lentement (contre-pression)', async () => {
    iterate.mockReturnValue(batches(['a'], ['b'], ['c']));
    const received: string[] = [];
    const slow = new Writable({
      highWaterMark: 1,
      write(chunk, _enc, cb) {
        received.push(String(chunk));
        setTimeout(cb, 5);
      }
    });
    const finished = new Promise<void>(resolve => slow.on('finish', resolve));
    await streamPlatformAuditCsv({}, slow);
    await finished;
    expect(received).toHaveLength(1 + 3);
  });

  it('s’arrête quand le client coupe, sans lire la suite', async () => {
    const pulled: string[] = [];
    iterate.mockImplementation(async function* () {
      for (const id of ['a', 'b', 'c']) {
        pulled.push(id);
        yield [log(id)];
      }
    });
    const out = new PassThrough();
    out.destroy();
    await streamPlatformAuditCsv({}, out);
    expect(pulled).toEqual([]);
  });

  it('coupe la connexion plutôt que d’envoyer un fichier tronqué pour complet quand la lecture échoue', async () => {
    iterate.mockImplementation(async function* () {
      yield [log('a')];
      throw new Error('base indisponible');
    });
    const out = new PassThrough();
    out.on('error', () => undefined);
    await streamPlatformAuditCsv({}, out);
    expect(out.destroyed).toBe(true);
  });
});
