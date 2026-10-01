/**
 * Événements d'authentification rattachés aux agences (ADR-006, phase 3).
 */
const membershipFindMany = jest.fn();
const tenantClientFindMany = jest.fn();
const logAuditEvent = jest.fn();
const recordAuditEvent = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    membership: { findMany: (...a: unknown[]) => membershipFindMany(...a) },
    tenantClient: { findMany: (...a: unknown[]) => tenantClientFindMany(...a) }
  }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: unknown[]) => logAuditEvent(...a),
  recordAuditEvent: (...a: unknown[]) => recordAuditEvent(...a)
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

import { logAuthEvent, recordAuthEvent, tenantIdsOfUser } from '../../src/services/audit-auth-events';

const entry = {
  actorUserId: 'u1',
  actorLabel: 'a@b.test',
  actionKey: 'AUTH_LOGIN_SUCCEEDED',
  entityType: 'User',
  entityId: 'u1'
};

beforeEach(() => {
  jest.clearAllMocks();
  membershipFindMany.mockResolvedValue([]);
  tenantClientFindMany.mockResolvedValue([]);
});

describe('tenantIdsOfUser', () => {
  it('réunit membres actifs et clients de portail, sans doublon', async () => {
    membershipFindMany.mockResolvedValue([{ tenantId: 'A' }, { tenantId: 'B' }]);
    tenantClientFindMany.mockResolvedValue([{ tenantId: 'B' }, { tenantId: 'C' }]);
    expect(await tenantIdsOfUser('u1')).toEqual(['A', 'B', 'C']);
    expect(membershipFindMany.mock.calls[0][0].where).toEqual({ userId: 'u1', status: 'ACTIVE' });
  });

  it('plafonne à 10 agences', async () => {
    membershipFindMany.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ tenantId: `m${i}` })));
    tenantClientFindMany.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ tenantId: `c${i}` })));
    expect(await tenantIdsOfUser('u1')).toHaveLength(10);
  });
});

describe('logAuthEvent', () => {
  it('écrit une ligne par agence de l’utilisateur', async () => {
    membershipFindMany.mockResolvedValue([{ tenantId: 'A' }, { tenantId: 'B' }]);
    await logAuthEvent(entry);
    expect(logAuditEvent.mock.calls.map(c => c[0].tenantId)).toEqual(['A', 'B']);
    expect(logAuditEvent.mock.calls[0][0]).toMatchObject({ actionKey: 'AUTH_LOGIN_SUCCEEDED', actorLabel: 'a@b.test' });
  });

  it('sans agence (super-admin, compte neuf) : une seule ligne de plateforme', async () => {
    await logAuthEvent(entry);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent.mock.calls[0][0].tenantId).toBeNull();
  });

  it('n’échoue jamais et n’efface pas l’événement quand les agences sont illisibles', async () => {
    membershipFindMany.mockRejectedValue(new Error('base indisponible'));
    await expect(logAuthEvent(entry)).resolves.toBeUndefined();
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent.mock.calls[0][0].tenantId).toBeNull();
  });
});

describe('recordAuthEvent (transactionnel)', () => {
  const tx: any = {
    membership: { findMany: (...a: unknown[]) => membershipFindMany(...a) },
    tenantClient: { findMany: (...a: unknown[]) => tenantClientFindMany(...a) },
    auditLog: { create: jest.fn() }
  };

  it('écrit une ligne par agence, par la transaction fournie', async () => {
    membershipFindMany.mockResolvedValue([{ tenantId: 'A' }, { tenantId: 'B' }]);
    await recordAuthEvent(tx, { ...entry, actionKey: 'AUTH_TOKEN_REUSE_DETECTED' });
    expect(recordAuditEvent).toHaveBeenCalledTimes(2);
    expect(recordAuditEvent.mock.calls[0][0]).toBe(tx);
    expect(recordAuditEvent.mock.calls.map(c => c[1].tenantId)).toEqual(['A', 'B']);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('propage l’échec : la transaction doit échouer avec lui', async () => {
    recordAuditEvent.mockRejectedValueOnce(new Error('écriture refusée'));
    await expect(recordAuthEvent(tx, entry)).rejects.toThrow('écriture refusée');
  });
});
