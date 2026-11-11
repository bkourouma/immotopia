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
// `isProduction` vient de config/env (plus de lecture directe de NODE_ENV) : le
// getter laisse chaque test choisir l'environnement au moment de l'appel.
let mockIsProduction = false;
jest.mock('../../src/config/env', () => ({
  get isProduction() {
    return mockIsProduction;
  }
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

describe('withJobLock : verrou indisponible (SUR-10)', () => {
  afterEach(() => {
    mockIsProduction = false;
    jest.useRealTimers();
  });
  const setEnv = (v: string) => {
    mockIsProduction = v === 'production';
  };
  const down = () => queryRaw.mockRejectedValue(new Error('relation "job_locks" does not exist'));
  /** Mode fermé sans attente réelle : les nouvelles tentatives passent tout de suite. */
  const noWait = { retryDelaysMs: [0, 0] } as const;

  it('(a) production + défaut : fn non exécutée, après 2 nouvelles tentatives à 5 s', async () => {
    jest.useFakeTimers();
    setEnv('production');
    down();
    const fn = jest.fn().mockResolvedValue('ok');
    const promise = withJobLock('job-a', 1000, fn);
    await jest.advanceTimersByTimeAsync(4_999);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(5_000);
    await expect(promise).resolves.toBeUndefined();
    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(fn).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
    const { logger } = jest.requireMock('../../src/utils/logger');
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(String(logger.error.mock.calls[0][0])).toContain('exécution refusée (mode fermé)');
  });

  it('mode fermé : un incident passager guéri à la 2e tentative exécute la tâche', async () => {
    jest.useFakeTimers();
    queryRaw.mockRejectedValueOnce(new Error('connexion perdue')).mockResolvedValueOnce([{ name: 'job-a' }]);
    const fn = jest.fn().mockResolvedValue('ok');
    const promise = withJobLock('job-a', 60_000, fn, { failOpen: false });
    await jest.advanceTimersByTimeAsync(5_000);
    await expect(promise).resolves.toBe('ok');
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(1); // libération
    const { logger } = jest.requireMock('../../src/utils/logger');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('mode fermé : une instance occupée découverte à la nouvelle tentative saute sans erreur', async () => {
    queryRaw.mockRejectedValueOnce(new Error('connexion perdue')).mockResolvedValueOnce([]);
    const fn = jest.fn();
    await expect(withJobLock('job-a', 1000, fn, { failOpen: false, ...noWait })).resolves.toBeUndefined();
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(fn).not.toHaveBeenCalled();
    const { logger } = jest.requireMock('../../src/utils/logger');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('mode ouvert : aucune nouvelle tentative, exécution immédiate sans verrou', async () => {
    queryRaw.mockRejectedValue(new Error('connexion perdue'));
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withJobLock('job-a', 1000, fn, { failOpen: true })).resolves.toBe('ok');
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('NODE_ENV brut ignoré : seul isProduction (config/env) fixe le défaut', async () => {
    const original = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    try {
      setEnv('development');
      down();
      const fn = jest.fn().mockResolvedValue('ok');
      await expect(withJobLock('job-a', 1000, fn)).resolves.toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = original;
    }
  });

  it('(b) hors production + défaut : fn exécutée', async () => {
    setEnv('development');
    down();
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withJobLock('job-a', 1000, fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('(c) failOpen:true explicite en production : fn exécutée', async () => {
    setEnv('production');
    down();
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withJobLock('job-a', 1000, fn, { failOpen: true })).resolves.toBe('ok');
  });

  it.each([
    [true, 'exécution sans verrou'],
    [false, 'tâche sautée']
  ])('message d’avertissement cohérent avec failOpen:%s', async (failOpen, expected) => {
    const { logger } = jest.requireMock('../../src/utils/logger');
    queryRaw.mockRejectedValue(new Error('connexion perdue'));
    await withJobLock('job-a', 1000, jest.fn().mockResolvedValue('ok'), { failOpen, ...noWait });
    const messages = logger.warn.mock.calls.map((c: any[]) => String(c[0]));
    expect(messages.some((m: string) => m.includes(expected))).toBe(true);
    const other = failOpen ? 'tâche sautée' : 'exécution sans verrou';
    expect(messages.some((m: string) => m.includes(other))).toBe(false);
  });

  it('(d) failOpen:false explicite hors production : fn non exécutée', async () => {
    setEnv('development');
    down();
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withJobLock('job-a', 1000, fn, { failOpen: false, ...noWait })).resolves.toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
  });

  it('(e) busy et acquired inchangés en production fermée', async () => {
    setEnv('production');
    queryRaw.mockResolvedValueOnce([]);
    const busyFn = jest.fn();
    await expect(withJobLock('job-a', 1000, busyFn, { failOpen: false })).resolves.toBeUndefined();
    expect(busyFn).not.toHaveBeenCalled();
    queryRaw.mockResolvedValueOnce([{ name: 'job-a' }]);
    const okFn = jest.fn().mockResolvedValue('ok');
    await expect(withJobLock('job-a', 1000, okFn, { failOpen: false })).resolves.toBe('ok');
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });
});
