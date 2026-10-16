/**
 * config/env.ts — visio LiveKit (spec 045) : les trois variables ou aucune,
 * `wss://` hors développement et test, secret de 32 caractères au moins.
 * `dotenv/config` est neutralisé pour qu'aucun fichier local n'influence le résultat.
 */
jest.mock('dotenv/config', () => ({}));

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(48),
  FRONTEND_URL: 'https://app.example.com',
  BACKEND_URL: 'https://api.example.com'
};
const SECRET = 'k'.repeat(40);
const saved = { ...process.env };

function loadWith(vars: Record<string, string | undefined>) {
  process.env = { ...saved, ...BASE_ENV };
  for (const key of ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']) delete process.env[key];
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
  const result = { env, thrown, exited: exit.mock.calls.length > 0, errors: error.mock.calls.flat().join('\n') };
  exit.mockRestore();
  error.mockRestore();
  warn.mockRestore();
  return result;
}

afterAll(() => {
  process.env = saved;
});

describe('LIVEKIT_* (spec 045)', () => {
  it('aucune variable : la visio est simplement absente', () => {
    const r = loadWith({ NODE_ENV: 'production' });
    expect(r.exited).toBe(false);
    expect(r.env?.LIVEKIT_URL).toBeUndefined();
    expect(r.env?.LIVEKIT_API_KEY).toBeUndefined();
  });

  it('valeurs vides : même chose que des variables absentes', () => {
    const r = loadWith({ NODE_ENV: 'production', LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' });
    expect(r.exited).toBe(false);
    expect(r.env?.LIVEKIT_URL).toBeUndefined();
  });

  it('les trois en wss:// : accepté en production', () => {
    const r = loadWith({
      NODE_ENV: 'production',
      LIVEKIT_URL: 'wss://immotopia.livekit.cloud',
      LIVEKIT_API_KEY: 'APIkey',
      LIVEKIT_API_SECRET: SECRET
    });
    expect(r.exited).toBe(false);
    expect(r.env?.LIVEKIT_URL).toBe('wss://immotopia.livekit.cloud');
  });

  it.each([
    ['URL seule', { LIVEKIT_URL: 'wss://x.example.com' }],
    ['clé sans secret', { LIVEKIT_URL: 'wss://x.example.com', LIVEKIT_API_KEY: 'k' }],
    ['secret seul', { LIVEKIT_API_SECRET: SECRET }]
  ])('refuse un jeu incomplet : %s', (_label, vars) => {
    const r = loadWith({ NODE_ENV: 'production', ...vars });
    expect(r.exited).toBe(true);
    expect(r.errors).toContain('les trois ou aucune');
  });

  it('refuse ws:// hors développement et test', () => {
    const r = loadWith({
      NODE_ENV: 'production',
      LIVEKIT_URL: 'ws://livekit.example.com',
      LIVEKIT_API_KEY: 'k',
      LIVEKIT_API_SECRET: SECRET
    });
    expect(r.exited).toBe(true);
    expect(r.errors).toContain('wss://');
  });

  it("refuse ws:// quand NODE_ENV est absent (un déploiement qui l'oublie)", () => {
    const r = loadWith({
      NODE_ENV: undefined,
      LIVEKIT_URL: 'ws://livekit.example.com',
      LIVEKIT_API_KEY: 'k',
      LIVEKIT_API_SECRET: SECRET
    });
    expect(r.exited).toBe(true);
  });

  it.each(['development', 'test'])('accepte ws://localhost en %s', nodeEnv => {
    const r = loadWith({
      NODE_ENV: nodeEnv,
      LIVEKIT_URL: 'ws://localhost:7880',
      LIVEKIT_API_KEY: 'devkey',
      LIVEKIT_API_SECRET: SECRET
    });
    expect(r.exited).toBe(false);
    expect(r.env?.LIVEKIT_URL).toBe('ws://localhost:7880');
  });

  it("refuse une URL qui n'est ni ws:// ni wss://", () => {
    const r = loadWith({
      NODE_ENV: 'test',
      LIVEKIT_URL: 'https://livekit.example.com',
      LIVEKIT_API_KEY: 'k',
      LIVEKIT_API_SECRET: SECRET
    });
    expect(r.exited).toBe(true);
  });

  it('refuse un secret de moins de 32 caractères', () => {
    const r = loadWith({
      NODE_ENV: 'test',
      LIVEKIT_URL: 'ws://localhost:7880',
      LIVEKIT_API_KEY: 'k',
      LIVEKIT_API_SECRET: 'trop-court'
    });
    expect(r.exited).toBe(true);
    expect(r.errors).toContain('32');
  });

  it("refuse une valeur d'exemple comme secret", () => {
    const r = loadWith({
      NODE_ENV: 'test',
      LIVEKIT_URL: 'ws://localhost:7880',
      LIVEKIT_API_KEY: 'k',
      LIVEKIT_API_SECRET: 'cle-secrete-de-l-application-meta-32-caracteres-min'
    });
    expect(r.exited).toBe(true);
  });
});
