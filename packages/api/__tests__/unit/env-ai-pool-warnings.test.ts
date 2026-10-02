/**
 * config/env.ts — avertissements d'ImmoCopilot sur `connection_limit` et sur
 * les limiteurs par instance. Jamais bloquants : le démarrage n'échoue pas.
 * Même technique que env-ai-provider.test.ts (rechargement isolé du module).
 */
// Module (et non script global) : évite « Cannot redeclare block-scoped variable » avec env-ai-provider.test.ts.
export {};

jest.mock('dotenv/config', () => ({}));

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:s3cret@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(48),
  FRONTEND_URL: 'https://app.example.com',
  BACKEND_URL: 'https://api.example.com'
};

const saved = { ...process.env };

function loadWith(vars: Record<string, string | undefined>) {
  process.env = { ...saved, ...BASE_ENV };
  // Hermétique : l'environnement de la machine (AI_PROVIDER=fake d'une recette locale…) ne doit pas fausser le test.
  for (const key of ['AI_PROVIDER', 'AI_TENANT_MINUTE_LIMIT', 'AI_TENANT_DAILY_LIMIT']) delete process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit');
  }) as never);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  let thrown: unknown;
  jest.isolateModules(() => {
    try {
      require('../../src/config/env');
    } catch (e) {
      thrown = e;
    }
  });
  const result = { thrown, exited: exit.mock.calls.length > 0, warnings: warn.mock.calls.flat().join('\n') };
  exit.mockRestore();
  warn.mockRestore();
  return result;
}

afterAll(() => {
  process.env = saved;
});

describe('connection_limit', () => {
  it('assistant coupé (défaut) : aucun avertissement, même sans connection_limit', () => {
    const r = loadWith({ NODE_ENV: 'development' });
    expect(r.exited).toBe(false);
    expect(r.warnings).not.toContain('connection_limit');
  });

  it('assistant actif sans connection_limit : avertit, ne bloque pas', () => {
    const r = loadWith({ NODE_ENV: 'development', AI_PROVIDER: 'fake' });
    expect(r.thrown).toBeUndefined();
    expect(r.exited).toBe(false);
    expect(r.warnings).toContain('ne fixe pas connection_limit');
  });

  it('assistant actif, valeur trop basse : avertit', () => {
    const r = loadWith({
      NODE_ENV: 'development',
      AI_PROVIDER: 'fake',
      DATABASE_URL: `${BASE_ENV.DATABASE_URL}?connection_limit=2`
    });
    expect(r.exited).toBe(false);
    expect(r.warnings).toContain('connection_limit=2 est trop bas');
  });

  it('assistant actif, valeur suffisante : pas d avertissement de pool', () => {
    const r = loadWith({
      NODE_ENV: 'development',
      AI_PROVIDER: 'fake',
      DATABASE_URL: `${BASE_ENV.DATABASE_URL}?connection_limit=20`
    });
    expect(r.warnings).not.toContain('connection_limit');
  });

  it.each(['abc', '0', '-5'])('valeur %p : signalée, sans arrêter le serveur, assistant coupé compris', raw => {
    const r = loadWith({ NODE_ENV: 'development', DATABASE_URL: `${BASE_ENV.DATABASE_URL}?connection_limit=${raw}` });
    expect(r.thrown).toBeUndefined();
    expect(r.exited).toBe(false);
    expect(r.warnings).toContain('entier strictement positif');
  });

  it('ne recopie pas le mot de passe de DATABASE_URL', () => {
    const r = loadWith({ NODE_ENV: 'development', AI_PROVIDER: 'fake' });
    expect(r.warnings).not.toContain('s3cret');
  });
});

describe('limiteurs par instance', () => {
  it('production, assistant actif : un seul avertissement « par instance »', () => {
    const r = loadWith({
      NODE_ENV: 'production',
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      AI_TENANT_MINUTE_LIMIT: '50',
      DATABASE_URL: `${BASE_ENV.DATABASE_URL}?connection_limit=20`
    });
    expect(r.exited).toBe(false);
    expect(r.warnings.match(/EN MÉMOIRE, par instance/g)).toHaveLength(1);
    expect(r.warnings).toContain('50/min');
  });

  it('production, assistant coupé : silence', () => {
    const r = loadWith({ NODE_ENV: 'production' });
    expect(r.warnings).not.toContain('EN MÉMOIRE');
  });

  it('hors production : silence', () => {
    const r = loadWith({ NODE_ENV: 'development', AI_PROVIDER: 'fake' });
    expect(r.warnings).not.toContain('EN MÉMOIRE');
  });
});
