/**
 * config/env.ts : SIGNATURE_REMINDER_DAYS_BEFORE (spec 044, SG-R11) : liste d'entiers
 * 1..30, dédoublonnée et triée décroissante ; "" ou "off" désactive ; invalide = refus.
 */
export {};

jest.mock('dotenv/config', () => ({}));

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(48),
  FRONTEND_URL: 'https://app.example.com',
  BACKEND_URL: 'https://api.example.com'
};

const saved = { ...process.env };

function loadWith(value: string | undefined) {
  process.env = { ...saved, ...BASE_ENV };
  if (value === undefined) delete process.env.SIGNATURE_REMINDER_DAYS_BEFORE;
  else process.env.SIGNATURE_REMINDER_DAYS_BEFORE = value;
  const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit');
  }) as never);
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  let env: typeof import('../../src/config/env').env | undefined;
  jest.isolateModules(() => {
    try {
      env = require('../../src/config/env').env;
    } catch {
      // process.exit simulé : la configuration est refusée.
    }
  });
  const result = {
    days: env?.SIGNATURE_REMINDER_DAYS_BEFORE,
    exited: exit.mock.calls.length > 0,
    errors: error.mock.calls.flat().join('\n')
  };
  exit.mockRestore();
  error.mockRestore();
  warn.mockRestore();
  return result;
}

afterAll(() => {
  process.env = saved;
});

describe('SIGNATURE_REMINDER_DAYS_BEFORE', () => {
  it('vaut 3,1 par défaut', () => {
    expect(loadWith(undefined).days).toEqual([3, 1]);
  });

  it('dédoublonne, trie décroissant et ignore les espaces', () => {
    expect(loadWith(' 1, 7 ,3,7 ').days).toEqual([7, 3, 1]);
  });

  it('"" et "off" désactivent', () => {
    expect(loadWith('').days).toEqual([]);
    expect(loadWith(' OFF ').days).toEqual([]);
  });

  it('refuse le démarrage sur une valeur invalide, avec un message clair', () => {
    for (const bad of ['0', '31', '2.5', 'abc', '3,,1', '-1']) {
      const { exited, errors } = loadWith(bad);
      expect(exited).toBe(true);
      expect(errors).toContain('SIGNATURE_REMINDER_DAYS_BEFORE');
    }
  });
});
