/**
 * Ordonnanceur de synchronisation des comptes propriétaires (lot C) :
 * single-flight, fraîcheur de 60 s, lectures non bloquantes, échec rattrapé.
 */

const syncAllOwnerAccounts = jest.fn();
jest.mock('../../src/lib/owner-account/service', () => ({
  syncAllOwnerAccounts: (...a: any[]) => syncAllOwnerAccounts(...a)
}));

const loggerError = jest.fn();
jest.mock('../../src/utils/logger', () => ({
  logger: { error: (...a: any[]) => loggerError(...a), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }
}));

import {
  awaitFreshSync,
  forceSync,
  getSyncState,
  requestBackgroundSync,
  resetSyncSchedulerForTests,
  SYNC_FRESHNESS_MS
} from '../../src/lib/accounting-exports/sync-scheduler';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

describe('sync-scheduler', () => {
  let now: number;
  let dateSpy: jest.SpyInstance;

  beforeEach(() => {
    resetSyncSchedulerForTests();
    syncAllOwnerAccounts.mockReset();
    loggerError.mockReset();
    now = new Date('2026-11-03T10:00:00Z').getTime();
    dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => dateSpy.mockRestore());

  it('est au repos, sans date, avant toute synchronisation', () => {
    expect(getSyncState('A')).toEqual({ status: 'idle', lastSyncedAt: null });
  });

  it('single-flight : trois appels concurrents ne lancent qu’une synchronisation', async () => {
    const d = deferred();
    syncAllOwnerAccounts.mockReturnValue(d.promise);
    requestBackgroundSync('A');
    requestBackgroundSync('A');
    const awaited = awaitFreshSync('A');
    expect(syncAllOwnerAccounts).toHaveBeenCalledTimes(1);
    d.resolve();
    await awaited;
    expect(syncAllOwnerAccounts).toHaveBeenCalledTimes(1);
  });

  it('requestBackgroundSync ne bloque pas : renvoie running alors que la synchronisation n’est pas finie', async () => {
    const d = deferred();
    syncAllOwnerAccounts.mockReturnValue(d.promise);
    expect(requestBackgroundSync('A')).toEqual({ status: 'running', lastSyncedAt: null });
    d.resolve();
    await flush();
    expect(getSyncState('A')).toEqual({ status: 'idle', lastSyncedAt: new Date(now).toISOString() });
  });

  it('ne relance pas avant 60 s, relance ensuite', async () => {
    syncAllOwnerAccounts.mockResolvedValue(undefined);
    requestBackgroundSync('A');
    await flush();
    now += SYNC_FRESHNESS_MS - 1;
    expect(requestBackgroundSync('A').status).toBe('idle');
    await flush();
    expect(syncAllOwnerAccounts).toHaveBeenCalledTimes(1);

    now += 1;
    expect(requestBackgroundSync('A').status).toBe('running');
    await flush();
    expect(syncAllOwnerAccounts).toHaveBeenCalledTimes(2);
  });

  it('un échec en arrière-plan passe en error, est journalisé et ne relance pas avant 60 s', async () => {
    syncAllOwnerAccounts.mockRejectedValue(new Error('boom'));
    requestBackgroundSync('A');
    await flush();
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(getSyncState('A')).toEqual({ status: 'error', lastSyncedAt: null });

    now += SYNC_FRESHNESS_MS - 1;
    expect(requestBackgroundSync('A').status).toBe('error');
    await flush();
    expect(syncAllOwnerAccounts).toHaveBeenCalledTimes(1);

    now += 1;
    syncAllOwnerAccounts.mockResolvedValue(undefined);
    expect(requestBackgroundSync('A').status).toBe('running');
    await flush();
    expect(syncAllOwnerAccounts).toHaveBeenCalledTimes(2);
    expect(getSyncState('A').status).toBe('idle');
  });

  it('awaitFreshSync rejoint la synchronisation en cours et attend sa fin', async () => {
    const d = deferred();
    syncAllOwnerAccounts.mockReturnValue(d.promise);
    requestBackgroundSync('A');
    let done = false;
    const awaited = awaitFreshSync('A').then(state => {
      done = true;
      return state;
    });
    await flush();
    expect(done).toBe(false);
    d.resolve();
    const state = await awaited;
    expect(done).toBe(true);
    expect(state.status).toBe('idle');
    expect(state.lastSyncedAt).not.toBeNull();
    expect(syncAllOwnerAccounts).toHaveBeenCalledTimes(1);
  });

  it('awaitFreshSync résout aussitôt quand la dernière synchronisation est fraîche', async () => {
    syncAllOwnerAccounts.mockResolvedValue(undefined);
    await awaitFreshSync('A');
    await awaitFreshSync('A');
    expect(syncAllOwnerAccounts).toHaveBeenCalledTimes(1);
  });

  it('awaitFreshSync rejette quand la synchronisation échoue', async () => {
    syncAllOwnerAccounts.mockRejectedValue(new Error('boom'));
    await expect(awaitFreshSync('A')).rejects.toThrow('boom');
    expect(getSyncState('A').status).toBe('error');
    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it('forceSync relance même quand l’état est frais, et rejette en cas d’échec', async () => {
    syncAllOwnerAccounts.mockResolvedValue(undefined);
    await awaitFreshSync('A');
    await forceSync('A');
    expect(syncAllOwnerAccounts).toHaveBeenCalledTimes(2);

    syncAllOwnerAccounts.mockRejectedValue(new Error('boom'));
    await expect(forceSync('A')).rejects.toThrow('boom');
  });

  it('forceSync rejoint la synchronisation en cours', async () => {
    const d = deferred();
    syncAllOwnerAccounts.mockReturnValue(d.promise);
    requestBackgroundSync('A');
    const forced = forceSync('A');
    d.resolve();
    await forced;
    expect(syncAllOwnerAccounts).toHaveBeenCalledTimes(1);
  });

  it('isole les agences : A en cours ne bloque pas B', async () => {
    const d = deferred();
    syncAllOwnerAccounts.mockReturnValueOnce(d.promise).mockResolvedValue(undefined);
    requestBackgroundSync('A');
    expect(requestBackgroundSync('B').status).toBe('running');
    expect(syncAllOwnerAccounts).toHaveBeenCalledTimes(2);
    expect(syncAllOwnerAccounts).toHaveBeenNthCalledWith(1, 'A');
    expect(syncAllOwnerAccounts).toHaveBeenNthCalledWith(2, 'B');
    await flush();
    expect(getSyncState('B').status).toBe('idle');
    expect(getSyncState('A').status).toBe('running');
    d.resolve();
    await flush();
  });
});
