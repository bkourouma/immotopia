/**
 * config/env.ts — variables des fournisseurs WhatsApp (Twilio, WaSender) : lues une fois
 * au démarrage, sans valeur par défaut pour un secret, délai numérique.
 */
export {};

jest.mock('dotenv/config', () => ({}));

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(48),
  FRONTEND_URL: 'https://app.example.com',
  BACKEND_URL: 'https://api.example.com'
};
const KEYS = [
  'WHATSAPP_PROVIDER',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
  'WASENDER_API_BASE_URL',
  'WASENDER_API_KEY',
  'WASENDER_SESSION',
  'WASENDER_SESSION_NAME',
  'WASENDER_TIMEOUT_MS',
  'WASENDER_SKIP_STATUS_CHECK'
];
const saved = { ...process.env };

function loadWith(vars: Record<string, string | undefined>) {
  process.env = { ...saved, ...BASE_ENV };
  for (const key of KEYS) delete process.env[key];
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
  const result = { env, exited: exit.mock.calls.length > 0, errors: error.mock.calls.flat().join('\n') };
  exit.mockRestore();
  error.mockRestore();
  warn.mockRestore();
  return result;
}

afterAll(() => {
  process.env = saved;
});

describe('fournisseurs WhatsApp (Twilio, WaSender)', () => {
  it('lit toutes les variables fournies', () => {
    const { env, exited } = loadWith({
      WHATSAPP_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'token-test',
      TWILIO_WHATSAPP_FROM: 'whatsapp:+14155550100',
      WASENDER_API_BASE_URL: 'https://wasender.example.com/api',
      WASENDER_API_KEY: 'cle-test',
      WASENDER_SESSION: 'session-1',
      WASENDER_SESSION_NAME: 'agence',
      WASENDER_TIMEOUT_MS: '15000',
      WASENDER_SKIP_STATUS_CHECK: 'true'
    });
    expect(exited).toBe(false);
    expect(env?.WHATSAPP_PROVIDER).toBe('twilio');
    expect(env?.TWILIO_ACCOUNT_SID).toBe('ACtest');
    expect(env?.TWILIO_AUTH_TOKEN).toBe('token-test');
    expect(env?.TWILIO_WHATSAPP_FROM).toBe('whatsapp:+14155550100');
    expect(env?.WASENDER_API_BASE_URL).toBe('https://wasender.example.com/api');
    expect(env?.WASENDER_API_KEY).toBe('cle-test');
    expect(env?.WASENDER_SESSION).toBe('session-1');
    expect(env?.WASENDER_SESSION_NAME).toBe('agence');
    expect(env?.WASENDER_TIMEOUT_MS).toBe(15000);
    expect(env?.WASENDER_SKIP_STATUS_CHECK).toBe('true');
  });

  it('absent ou vide vaut undefined, sans valeur par défaut pour un secret', () => {
    const { env, exited } = loadWith({ TWILIO_AUTH_TOKEN: '', WASENDER_API_KEY: '  ' });
    expect(exited).toBe(false);
    expect(env?.TWILIO_ACCOUNT_SID).toBeUndefined();
    expect(env?.TWILIO_AUTH_TOKEN).toBeUndefined();
    expect(env?.TWILIO_WHATSAPP_FROM).toBeUndefined();
    expect(env?.WASENDER_API_KEY).toBeUndefined();
    expect(env?.WASENDER_SESSION).toBeUndefined();
    expect(env?.WASENDER_SESSION_NAME).toBeUndefined();
    expect(env?.WHATSAPP_PROVIDER).toBeUndefined();
    expect(env?.WASENDER_SKIP_STATUS_CHECK).toBeUndefined();
  });

  it('applique la base et le délai par défaut', () => {
    const { env } = loadWith({});
    expect(env?.WASENDER_API_BASE_URL).toBe('https://wasenderapi.com/api');
    expect(env?.WASENDER_TIMEOUT_MS).toBe(10000);
  });

  it('refuse un délai non numérique', () => {
    const { exited, errors } = loadWith({ WASENDER_TIMEOUT_MS: 'bientot' });
    expect(exited).toBe(true);
    expect(errors).toContain('WASENDER_TIMEOUT_MS');
  });
});
