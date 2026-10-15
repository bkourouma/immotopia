/**
 * config/env.ts — SIGNATURE_PROVIDER_REQUIRED_KINDS (spec 043, SG-R1) : chaque
 * élément est validé (une faute de frappe bloque le démarrage au lieu de laisser un
 * type sans la protection attendue) et un avertissement signale l'absence du compromis.
 * `env` est un singleton évalué à l'import : chaque scénario recharge le module isolé.
 */
jest.mock('dotenv/config', () => ({}));

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(48),
  FRONTEND_URL: 'https://app.example.com',
  BACKEND_URL: 'https://api.example.com'
};

const saved = { ...process.env };

function loadWith(kinds: string | undefined) {
  process.env = { ...saved, ...BASE_ENV };
  if (kinds === undefined) delete process.env.SIGNATURE_PROVIDER_REQUIRED_KINDS;
  else process.env.SIGNATURE_PROVIDER_REQUIRED_KINDS = kinds;
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
    env,
    exited: exit.mock.calls.length > 0,
    errors: error.mock.calls.flat().join('\n'),
    warnings: warn.mock.calls.flat().join('\n')
  };
  exit.mockRestore();
  error.mockRestore();
  warn.mockRestore();
  return result;
}

afterAll(() => {
  process.env = saved;
});

describe('SIGNATURE_PROVIDER_REQUIRED_KINDS', () => {
  it('vaut SALE_AGREEMENT par défaut, sans avertissement', () => {
    const { env, warnings, exited } = loadWith(undefined);
    expect(exited).toBe(false);
    expect(env?.SIGNATURE_PROVIDER_REQUIRED_KINDS).toEqual(['SALE_AGREEMENT']);
    expect(warnings).not.toContain('SIGNATURE_PROVIDER_REQUIRED_KINDS');
  });

  it('accepte plusieurs types, en ignorant la casse et les espaces', () => {
    const { env, exited } = loadWith(' sale_agreement , Management_Mandate ');
    expect(exited).toBe(false);
    expect(env?.SIGNATURE_PROVIDER_REQUIRED_KINDS).toEqual(['SALE_AGREEMENT', 'MANAGEMENT_MANDATE']);
  });

  it('refuse le démarrage sur un type inconnu, avec un message clair', () => {
    const { exited, errors } = loadWith('SALE_AGREMENT');
    expect(exited).toBe(true);
    expect(errors).toContain('SIGNATURE_PROVIDER_REQUIRED_KINDS');
    expect(errors).toContain('SALE_AGREMENT');
    expect(errors).toContain('SALE_AGREEMENT');
  });

  it('avertit quand le compromis de vente n’y figure pas (liste vide ou autre type)', () => {
    for (const value of ['', 'MANAGEMENT_MANDATE']) {
      const { env, exited, warnings } = loadWith(value);
      expect(exited).toBe(false);
      expect(env?.SIGNATURE_PROVIDER_REQUIRED_KINDS).toEqual(value ? ['MANAGEMENT_MANDATE'] : []);
      expect(warnings).toContain('SALE_AGREEMENT');
    }
  });
});
