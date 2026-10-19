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
