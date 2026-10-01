/**
 * Voie d'écriture du journal : file asynchrone (plafonnée, vidée à l'arrêt
 * avant la base) et voie transactionnelle.
 */
import { AuditActionKey } from '../../src/types/audit-types';
import { runWithRequestContext } from '../../src/utils/request-context';

const createMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: { auditLog: { createMany: (...args: unknown[]) => createMany(...args) } }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

import { AUDIT_QUEUE_MAX, flushAuditEvents, logAuditEvent, recordAuditEvent } from '../../src/services/audit-service';
import { runShutdownHooks } from '../../src/utils/shutdown-hooks';

const entry = { actionKey: AuditActionKey.PROPERTY_CREATED, entityType: 'PROPERTY', entityId: 'p1' };

beforeEach(() => {
  createMany.mockReset();
  createMany.mockResolvedValue({ count: 0 });
});

afterEach(async () => {
  // Vide ce qui resterait en file pour ne pas contaminer le test suivant.
  createMany.mockResolvedValue({ count: 0 });
  await flushAuditEvents();
});

describe('logAuditEvent', () => {
  it('enrichit la ligne dans la requête, pas au moment de la vidange', async () => {
    runWithRequestContext(
      { ip: '9.9.9.9', userAgent: 'ua', requestId: 'r-1', actor: { userId: 'u1', tenantId: 't1', type: 'USER' } },
      () => logAuditEvent(entry)
    );

    // La vidange tourne ici, HORS de tout contexte de requête.
    await flushAuditEvents();

    const rows = createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: 'u1',
      tenantId: 't1',
      requestId: 'r-1',
      ipAddress: '9.9.9.9',
      scope: 'TENANT'
    });
  });

  it('remet en file les lignes quand l’écriture échoue, puis les écrit au flush suivant', async () => {
    createMany.mockRejectedValueOnce(new Error('base indisponible'));
    logAuditEvent(entry);

    expect(await flushAuditEvents()).toBe(1);

    createMany.mockResolvedValueOnce({ count: 1 });
    expect(await flushAuditEvents()).toBe(0);
    expect(createMany).toHaveBeenCalledTimes(2);
  });

  it('plafonne la file quand la base reste indisponible', async () => {
    createMany.mockRejectedValue(new Error('base indisponible'));
    for (let i = 0; i < AUDIT_QUEUE_MAX + 50; i++) {
      logAuditEvent({ ...entry, entityId: String(i) });
    }
    // 100 lignes déclenchent des vidanges automatiques qui échouent et remettent en file.
    await flushAuditEvents();
    expect(await flushAuditEvents()).toBeLessThanOrEqual(AUDIT_QUEUE_MAX);
  });
});

describe('arrêt propre', () => {
  it('vide la file via le crochet d’arrêt exécuté avant la fermeture de la base', async () => {
    logAuditEvent(entry);
    await runShutdownHooks();
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data).toHaveLength(1);
  });
});

describe('recordAuditEvent', () => {
  it('écrit par le client de la transaction fournie, ligne enrichie', async () => {
    const create = jest.fn().mockResolvedValue({});
    await runWithRequestContext(
      { ip: null, userAgent: null, requestId: 'r-2', actor: { userId: 'u2', tenantId: 't2' } },
      () => recordAuditEvent({ auditLog: { create } }, { ...entry, actionKey: AuditActionKey.ROLE_ASSIGNED })
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      actionKey: 'ROLE_ASSIGNED',
      actorUserId: 'u2',
      tenantId: 't2',
      category: 'SECURITY',
      requestId: 'r-2'
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('propage l’échec : la transaction métier doit échouer avec lui', async () => {
    const create = jest.fn().mockRejectedValue(new Error('écriture refusée'));
    await expect(recordAuditEvent({ auditLog: { create } }, entry)).rejects.toThrow('écriture refusée');
  });
});
