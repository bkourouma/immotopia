/**
 * config/env.ts — SIGNATURE_PROVIDER=yousign (spec 044, lot S6) : clé et secret requis,
 * base https uniquement (sandbox par défaut), avertissement si sandbox en production.
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

function loadWith(vars: Record<string, string | undefined>) {
  process.env = { ...saved, ...BASE_ENV };
  for (const key of [
    'SIGNATURE_PROVIDER',
    'YOUSIGN_API_KEY',
    'YOUSIGN_API_BASE_URL',
    'YOUSIGN_WEBHOOK_SECRET',
    'SIGNATURE_PROVIDER_TIMEOUT_MS',
    'YOUSIGN_SIGNATURE_LEVEL',
    'ORANGE_SMS_API_BASE_URL',
    'SMS_ALLOWED_DIAL_CODES',
    'SIGNATURE_SMS_DAILY_LIMIT'
  ]) {
    delete process.env[key];
  }
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

const VALID = { SIGNATURE_PROVIDER: 'yousign', YOUSIGN_API_KEY: 'cle-factice', YOUSIGN_WEBHOOK_SECRET: 'x'.repeat(32) };

describe('SIGNATURE_PROVIDER=yousign', () => {
  it('démarre avec clé et secret, base sandbox et délai par défaut', () => {
    const { env, exited } = loadWith(VALID);
    expect(exited).toBe(false);
    expect(env?.SIGNATURE_PROVIDER).toBe('yousign');
    expect(env?.YOUSIGN_API_BASE_URL).toBe('https://api-sandbox.yousign.app/v3');
    expect(env?.SIGNATURE_PROVIDER_TIMEOUT_MS).toBe(20000);
    expect(env?.YOUSIGN_SIGNATURE_LEVEL).toBe('electronic_signature');
    expect(env?.SIGNATURE_SMS_DAILY_LIMIT).toBe(200);
    expect(env?.SMS_ALLOWED_DIAL_CODES).toContain('224');
  });

  it('accepte un niveau avancé, refuse un niveau inconnu', () => {
    expect(
      loadWith({ ...VALID, YOUSIGN_SIGNATURE_LEVEL: 'advanced_electronic_signature' }).env?.YOUSIGN_SIGNATURE_LEVEL
    ).toBe('advanced_electronic_signature');
    expect(loadWith({ ...VALID, YOUSIGN_SIGNATURE_LEVEL: 'qualifiee' }).exited).toBe(true);
  });

  it('refuse une base Orange SMS non https', () => {
    const { exited, errors } = loadWith({ ...VALID, ORANGE_SMS_API_BASE_URL: 'http://api.orange.com' });
    expect(exited).toBe(true);
    expect(errors).toContain('ORANGE_SMS_API_BASE_URL');
  });

  it('refuse sans clé API', () => {
    const { exited, errors } = loadWith({ ...VALID, YOUSIGN_API_KEY: '' });
    expect(exited).toBe(true);
    expect(errors).toContain('YOUSIGN_API_KEY');
    expect(errors).toContain('variable requise quand SIGNATURE_PROVIDER=yousign');
  });

  it('refuse sans secret de webhook, ou trop court', () => {
    const missing = loadWith({ ...VALID, YOUSIGN_WEBHOOK_SECRET: undefined });
    expect(missing.exited).toBe(true);
    expect(missing.errors).toContain('YOUSIGN_WEBHOOK_SECRET');
    expect(loadWith({ ...VALID, YOUSIGN_WEBHOOK_SECRET: 'court' }).exited).toBe(true);
  });

  it('refuse une base non https', () => {
    const { exited, errors } = loadWith({ ...VALID, YOUSIGN_API_BASE_URL: 'http://api.yousign.app/v3' });
    expect(exited).toBe(true);
    expect(errors).toContain('YOUSIGN_API_BASE_URL');
  });

  it('refuse un délai hors bornes', () => {
    expect(loadWith({ ...VALID, SIGNATURE_PROVIDER_TIMEOUT_MS: '100' }).exited).toBe(true);
    expect(loadWith({ ...VALID, SIGNATURE_PROVIDER_TIMEOUT_MS: '30000' }).env?.SIGNATURE_PROVIDER_TIMEOUT_MS).toBe(
      30000
    );
  });

  it('n’exige rien quand le prestataire n’est pas yousign', () => {
    expect(loadWith({ SIGNATURE_PROVIDER: 'internal' }).exited).toBe(false);
  });

  it('refuse en production la base sandbox, accepte la base de production', () => {
    const sandbox = loadWith({ ...VALID, NODE_ENV: 'production' });
    expect(sandbox.exited).toBe(true);
    expect(sandbox.errors).toContain('YOUSIGN_API_BASE_URL');
    const prod = loadWith({ ...VALID, NODE_ENV: 'production', YOUSIGN_API_BASE_URL: 'https://api.yousign.app/v3' });
    expect(prod.warnings).not.toContain('base SANDBOX');
  });
});
