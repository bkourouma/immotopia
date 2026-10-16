/**
 * config/env.ts — visio LiveKit (spec 045) : les trois variables ou aucune,
 * `wss://` hors développement et test, secret de 32 caractères au moins.
 * `dotenv/config` est neutralisé pour qu'aucun fichier local n'influence le résultat.
 */
// Module, pas script global : ses constantes ne doivent pas entrer en collision avec
// celles des autres tests d'environnement compiles dans le meme lot ts-jest (TS2451).
export {};

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

describe('LIVEKIT_RECORDING_S3_* (spec 045, R3)', () => {
  const VISIO = { LIVEKIT_URL: 'wss://x.livekit.cloud', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: SECRET };
  const S3 = {
    LIVEKIT_RECORDING_S3_BUCKET: 'bucket-ag',
    LIVEKIT_RECORDING_S3_ACCESS_KEY: 'AK',
    LIVEKIT_RECORDING_S3_SECRET: 's3'
  };

  function loadRecording(vars: Record<string, string | undefined>) {
    for (const key of Object.keys(saved).filter(k => k.startsWith('LIVEKIT_RECORDING_S3_'))) delete saved[key];
    return loadWith({ NODE_ENV: 'production', ...vars });
  }

  it('défauts : région us-east-1, chemin virtuel (0), préfixe ag-enregistrements/', () => {
    const r = loadRecording({ ...VISIO, ...S3 });
    expect(r.exited).toBe(false);
    expect(r.env).toMatchObject({
      LIVEKIT_RECORDING_S3_REGION: 'us-east-1',
      LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE: '0',
      LIVEKIT_RECORDING_S3_PREFIX: 'ag-enregistrements/'
    });
    expect(r.env?.LIVEKIT_RECORDING_S3_ENDPOINT).toBeUndefined();
  });

  it('clés S3 courtes acceptées (pas de minimum de 32 caractères), endpoint http(s) et chemin forcé', () => {
    const r = loadRecording({
      ...VISIO,
      ...S3,
      LIVEKIT_RECORDING_S3_ENDPOINT: 'https://localhost:9000',
      LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE: '1'
    });
    expect(r.exited).toBe(false);
    expect(r.env?.LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE).toBe('1');
  });

  it('rien du tout : accepté (visio sans enregistrement)', () => {
    expect(loadRecording({ ...VISIO }).exited).toBe(false);
    expect(loadRecording({}).exited).toBe(false);
  });

  it.each([
    ['bucket seul', { LIVEKIT_RECORDING_S3_BUCKET: 'bucket-ag' }],
    ['clés sans bucket', { LIVEKIT_RECORDING_S3_ACCESS_KEY: 'AK', LIVEKIT_RECORDING_S3_SECRET: 's3' }],
    ['bucket et clé sans secret', { LIVEKIT_RECORDING_S3_BUCKET: 'bucket-ag', LIVEKIT_RECORDING_S3_ACCESS_KEY: 'AK' }]
  ])('refuse un jeu incomplet : %s', (_label, vars) => {
    const r = loadRecording({ ...VISIO, ...vars });
    expect(r.exited).toBe(true);
    expect(r.errors).toContain('les trois ou aucune');
  });

  it('refuse l enregistrement sans la visio configurée', () => {
    const r = loadRecording({ ...S3 });
    expect(r.exited).toBe(true);
    expect(r.errors).toContain('exige la visio');
  });

  it('refuse un endpoint qui n est pas http(s) et un FORCE_PATH_STYLE hors 0/1', () => {
    expect(loadRecording({ ...VISIO, ...S3, LIVEKIT_RECORDING_S3_ENDPOINT: 'ftp://x' }).exited).toBe(true);
    expect(loadRecording({ ...VISIO, ...S3, LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE: 'oui' }).exited).toBe(true);
  });
});

describe('LIVEKIT_RECORDING_* : durcissements (phase 3)', () => {
  const BASE = {
    LIVEKIT_URL: 'wss://x.livekit.cloud',
    LIVEKIT_API_KEY: 'k',
    LIVEKIT_API_SECRET: SECRET,
    LIVEKIT_RECORDING_S3_BUCKET: 'bucket-ag',
    LIVEKIT_RECORDING_S3_ACCESS_KEY: 'AK',
    LIVEKIT_RECORDING_S3_SECRET: 's3'
  };

  it('endpoint http:// refusé hors development et test, https:// accepté', () => {
    const insecure = { ...BASE, LIVEKIT_RECORDING_S3_ENDPOINT: 'http://minio.example.com:9000' };
    for (const nodeEnv of ['production', undefined]) {
      const r = loadWith({ ...insecure, NODE_ENV: nodeEnv });
      expect(r.exited).toBe(true);
      expect(r.errors).toContain('https://');
    }
    expect(loadWith({ ...insecure, NODE_ENV: 'development' }).exited).toBe(false);
    expect(loadWith({ ...insecure, NODE_ENV: 'test' }).exited).toBe(false);
    expect(
      loadWith({ ...BASE, NODE_ENV: 'production', LIVEKIT_RECORDING_S3_ENDPOINT: 'https://s3.example.com' }).exited
    ).toBe(false);
  });

  it.each(['/ag-enregistrements/', '../hors', 'ag/../hors/', 'a\\b/'])('préfixe %s refusé', prefix => {
    const r = loadWith({ ...BASE, NODE_ENV: 'production', LIVEKIT_RECORDING_S3_PREFIX: prefix });
    expect(r.exited).toBe(true);
    expect(r.errors).toContain('relatif');
  });

  it('préfixe relatif accepté', () => {
    const r = loadWith({ ...BASE, NODE_ENV: 'production', LIVEKIT_RECORDING_S3_PREFIX: 'prod/ag-enregistrements/' });
    expect(r.exited).toBe(false);
    expect(r.env?.LIVEKIT_RECORDING_S3_PREFIX).toBe('prod/ag-enregistrements/');
  });

  it('LIVEKIT_RECORDING_MAX_BYTES : 8 Gio par défaut, entier positif seulement', () => {
    expect(loadWith({ ...BASE, NODE_ENV: 'production' }).env?.LIVEKIT_RECORDING_MAX_BYTES).toBe(8 * 1024 ** 3);
    expect(
      loadWith({ ...BASE, NODE_ENV: 'production', LIVEKIT_RECORDING_MAX_BYTES: '1048576' }).env
        ?.LIVEKIT_RECORDING_MAX_BYTES
    ).toBe(1048576);
    for (const bad of ['0', '-5', 'beaucoup', '1.5']) {
      expect(loadWith({ ...BASE, NODE_ENV: 'production', LIVEKIT_RECORDING_MAX_BYTES: bad }).exited).toBe(true);
    }
  });
});
