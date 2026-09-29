/**
 * config/env.ts — faux fournisseur d'ImmoCopilot et plafonds par agence.
 *
 * `env` est un singleton évalué à l'import : chaque scénario recharge le module
 * dans un registre isolé après avoir positionné `process.env`. `dotenv/config`
 * est neutralisé pour qu'aucun fichier local n'influence le résultat.
 */
jest.mock('dotenv/config', () => ({}));

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(48),
  FRONTEND_URL: 'https://app.example.com',
  BACKEND_URL: 'https://api.example.com'
};

const saved = { ...process.env };

function loadWith(vars: Record<string, string | undefined>) {
  process.env = { ...saved, ...BASE_ENV };
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit');
  }) as never);
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  let env: typeof import('../../src/config/env').env | undefined;
  let thrown: unknown;
  jest.isolateModules(() => {
    try {
      env = require('../../src/config/env').env;
    } catch (e) {
      thrown = e;
    }
  });
  const result = {
    env,
    thrown,
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

describe('AI_PROVIDER=fake', () => {
  it.each(['development', 'test'])(
    'est accepté quand NODE_ENV vaut explicitement %s, avec un avertissement',
    nodeEnv => {
      const r = loadWith({ NODE_ENV: nodeEnv, AI_PROVIDER: 'fake' });
      expect(r.exited).toBe(false);
      expect(r.env?.AI_PROVIDER).toBe('fake');
      expect(r.warnings).toContain('AI_PROVIDER=fake');
    }
  );

  it('est refusé quand NODE_ENV est absent (il vaudrait « development » par défaut)', () => {
    const r = loadWith({ NODE_ENV: undefined, AI_PROVIDER: 'fake' });
    expect(r.exited).toBe(true);
    expect(r.errors).toContain('AI_PROVIDER');
    expect(r.errors).toContain("'development' ou 'test'");
  });

  it.each(['production', 'staging'])('est refusé quand NODE_ENV vaut %s', nodeEnv => {
    const r = loadWith({ NODE_ENV: nodeEnv, AI_PROVIDER: 'fake' });
    expect(r.exited).toBe(true);
  });

  it('les autres fournisseurs ne sont pas concernés et n’émettent pas l’avertissement', () => {
    const r = loadWith({ NODE_ENV: undefined, AI_PROVIDER: 'disabled' });
    expect(r.exited).toBe(false);
    expect(r.warnings).not.toContain('AI_PROVIDER=fake');
  });
});

describe('plafonds par agence', () => {
  it('valent 100 par minute et 3000 par jour par défaut', () => {
    const r = loadWith({ NODE_ENV: 'test' });
    expect(r.env?.AI_TENANT_MINUTE_LIMIT).toBe(100);
    expect(r.env?.AI_TENANT_DAILY_LIMIT).toBe(3000);
  });

  it('sont configurables et refusent une valeur invalide', () => {
    const ok = loadWith({ NODE_ENV: 'test', AI_TENANT_DAILY_LIMIT: '500', AI_TENANT_MINUTE_LIMIT: '20' });
    expect(ok.env?.AI_TENANT_DAILY_LIMIT).toBe(500);
    expect(ok.env?.AI_TENANT_MINUTE_LIMIT).toBe(20);
    expect(loadWith({ NODE_ENV: 'test', AI_TENANT_DAILY_LIMIT: '0' }).exited).toBe(true);
  });
});
