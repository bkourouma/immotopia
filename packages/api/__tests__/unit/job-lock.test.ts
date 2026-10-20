/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Verrou distribué des tâches planifiées : prise atomique, libération par le
 * titulaire, repli sans verrou quand la table est absente.
 */
const queryRaw = jest.fn();
const executeRaw = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $queryRaw: (...a: any[]) => queryRaw(...a),
    $executeRaw: (...a: any[]) => executeRaw(...a)
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { withJobLock } from '../../src/utils/job-lock';

beforeEach(() => {
  jest.clearAllMocks();
  executeRaw.mockResolvedValue(1);
});

describe('withJobLock', () => {
  it('prise réussie : exécute fn puis libère le verrou', async () => {
    queryRaw.mockResolvedValue([{ name: 'job-a' }]);
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withJobLock('job-a', 1000, fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('prise refusée : fn non exécutée, undefined, pas de libération', async () => {
    queryRaw.mockResolvedValue([]);
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withJobLock('job-a', 1000, fn)).resolves.toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it.each([
    ['message PostgreSQL', new Error('relation "job_locks" does not exist')],
    ['code P2010', Object.assign(new Error('Raw query failed'), { code: 'P2010', meta: { code: '42P01' } })],
    ['code P2021', Object.assign(new Error('table missing'), { code: 'P2021' })]
  ])('table absente (%s) : fn exécutée quand même, pas de libération', async (_label, error) => {
    queryRaw.mockRejectedValue(error);
    const fn = jest.fn().mockResolvedValue(42);
    await expect(withJobLock('job-a', 1000, fn)).resolves.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('fn qui jette : erreur relancée et verrou libéré', async () => {
    queryRaw.mockResolvedValue([{ name: 'job-a' }]);
    const fn = jest.fn().mockRejectedValue(new Error('boum'));
    await expect(withJobLock('job-a', 1000, fn)).rejects.toThrow('boum');
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('échec de la libération : aucune exception, le résultat est rendu', async () => {
    queryRaw.mockResolvedValue([{ name: 'job-a' }]);
    executeRaw.mockRejectedValue(new Error('connexion perdue'));
    await expect(withJobLock('job-a', 1000, async () => 'ok')).resolves.toBe('ok');
  });
});

describe('withJobLock : prolongation du verrou', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  /** fn qui dure jusqu'à l'appel de `finish()`. */
  function slowFn() {
    let finish!: () => void;
    const fn = jest.fn(
      () =>
        new Promise<string>(resolve => {
          finish = () => resolve('ok');
        })
    );
    return { fn, finish: () => finish() };
  }

  it('prolonge toutes les ttl/2 pendant fn, puis plus du tout, et libère après arrêt du timer', async () => {
    jest.useFakeTimers();
    queryRaw.mockResolvedValue([{ name: 'job-a' }]);
    const order: string[] = [];
    executeRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      order.push(strings.join('?').includes('now() + (') ? 'extend' : 'release');
      return 1;
    });
    const { fn, finish } = slowFn();
    const promise = withJobLock('job-a', 1000, fn);
    await jest.advanceTimersByTimeAsync(0);
    expect(executeRaw).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(500);
    expect(order).toEqual(['extend']);
    await jest.advanceTimersByTimeAsync(1000);
    expect(order).toEqual(['extend', 'extend', 'extend']);

    finish();
    await expect(promise).resolves.toBe('ok');
    expect(order).toEqual(['extend', 'extend', 'extend', 'release']);

    await jest.advanceTimersByTimeAsync(5000);
    expect(order).toHaveLength(4);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    ['busy', () => queryRaw.mockResolvedValue([])],
    ['unavailable', () => queryRaw.mockRejectedValue(new Error('base injoignable'))]
  ])('aucune prolongation ni timer quand l état est %s', async (_label, setup) => {
    jest.useFakeTimers();
    setup();
    const { fn, finish } = slowFn();
    const promise = withJobLock('job-a', 1000, fn);
    await jest.advanceTimersByTimeAsync(0);
    expect(jest.getTimerCount()).toBe(0);
    if (fn.mock.calls.length > 0) finish();
    await promise;
    await jest.advanceTimersByTimeAsync(3000);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('une erreur de prolongation n interrompt pas fn', async () => {
    jest.useFakeTimers();
    queryRaw.mockResolvedValue([{ name: 'job-a' }]);
    executeRaw.mockRejectedValue(new Error('connexion perdue'));
    const { fn, finish } = slowFn();
    const promise = withJobLock('job-a', 1000, fn);
    await jest.advanceTimersByTimeAsync(1200);
    expect(executeRaw).toHaveBeenCalled();
    finish();
    await expect(promise).resolves.toBe('ok');
  });

  it('pas de chevauchement : une prolongation lente bloque la suivante', async () => {
    jest.useFakeTimers();
    queryRaw.mockResolvedValue([{ name: 'job-a' }]);
    let unblock!: () => void;
    executeRaw.mockImplementationOnce(() => new Promise(resolve => (unblock = () => resolve(1))));
    executeRaw.mockResolvedValue(1);
    const { fn, finish } = slowFn();
    const promise = withJobLock('job-a', 1000, fn);
    await jest.advanceTimersByTimeAsync(1600); // ticks à 500, 1000, 1500
    expect(executeRaw).toHaveBeenCalledTimes(1);
    unblock();
    await jest.advanceTimersByTimeAsync(500);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    finish();
    await promise;
  });

  it('prolongation en vol quand fn se termine : la libération passe en dernier', async () => {
    jest.useFakeTimers();
    queryRaw.mockResolvedValue([{ name: 'job-a' }]);
    const order: string[] = [];
    let unblock!: () => void;
    executeRaw.mockImplementation((strings: TemplateStringsArray) => {
      const kind = strings.join('?').includes('now() + (') ? 'extend' : 'release';
      if (kind === 'extend') {
        order.push('extend:start');
        return new Promise(resolve => {
          unblock = () => {
            order.push('extend:end');
            resolve(1);
          };
        });
      }
      order.push('release');
      return Promise.resolve(1);
    });
    const { fn, finish } = slowFn();
    const promise = withJobLock('job-a', 1000, fn);
    await jest.advanceTimersByTimeAsync(500); // prolongation lancée, jamais terminée
    expect(order).toEqual(['extend:start']);

    finish();
    await jest.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['extend:start']); // release attend la prolongation

    unblock();
    await expect(promise).resolves.toBe('ok');
    expect(order).toEqual(['extend:start', 'extend:end', 'release']);
  });
});
