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
    'YOUSIGN_ALLOW_SANDBOX',
    'SMS_PROVIDER',
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
    expect(prod.exited).toBe(false);
    expect(prod.env?.YOUSIGN_API_BASE_URL).toBe('https://api.yousign.app/v3');
    expect(prod.warnings).not.toContain('base SANDBOX');
  });
});

/**
 * YOUSIGN_ALLOW_SANDBOX : le staging tourne en NODE_ENV=production (make-env.sh) et doit
 * pouvoir brancher la sandbox Yousign ; la production, jamais (deploy.sh prod refuse le drapeau).
 */
describe('YOUSIGN_ALLOW_SANDBOX (base sandbox en production)', () => {
  const PROD = { ...VALID, NODE_ENV: 'production' };

  it('vaut 0 par défaut', () => {
    expect(loadWith(VALID).env?.YOUSIGN_ALLOW_SANDBOX).toBe('0');
  });

  it('production + sandbox sans drapeau : refus, le message nomme le drapeau', () => {
    const { exited, errors } = loadWith(PROD);
    expect(exited).toBe(true);
    expect(errors).toContain('YOUSIGN_API_BASE_URL');
    expect(errors).toContain('YOUSIGN_ALLOW_SANDBOX=1');
  });

  it('production + sandbox + drapeau 1 : accepté, avec l’avertissement « aucune valeur »', () => {
    const { env, exited, warnings } = loadWith({ ...PROD, YOUSIGN_ALLOW_SANDBOX: '1' });
    expect(exited).toBe(false);
    expect(env?.YOUSIGN_ALLOW_SANDBOX).toBe('1');
    expect(env?.YOUSIGN_API_BASE_URL).toBe('https://api-sandbox.yousign.app/v3');
    expect(warnings).toContain('base SANDBOX');
    expect(warnings).toContain('aucune valeur');
  });

  it('le drapeau lève aussi le refus pour une autre base contenant « sandbox »', () => {
    const base = 'https://sandbox.proxy.example.com/yousign/v3';
    expect(loadWith({ ...PROD, YOUSIGN_API_BASE_URL: base }).exited).toBe(true);
    const ok = loadWith({ ...PROD, YOUSIGN_API_BASE_URL: base, YOUSIGN_ALLOW_SANDBOX: '1' });
    expect(ok.exited).toBe(false);
    expect(ok.warnings).toContain('aucune valeur');
  });

  it('drapeau 0 ou vide : le refus en production reste entier', () => {
    expect(loadWith({ ...PROD, YOUSIGN_ALLOW_SANDBOX: '0' }).exited).toBe(true);
    expect(loadWith({ ...PROD, YOUSIGN_ALLOW_SANDBOX: '' }).exited).toBe(true);
  });

  it('refuse une valeur de drapeau autre que 0 ou 1', () => {
    const { exited, errors } = loadWith({ ...PROD, YOUSIGN_ALLOW_SANDBOX: 'true' });
    expect(exited).toBe(true);
    expect(errors).toContain('YOUSIGN_ALLOW_SANDBOX');
  });

  it('base de production : drapeau sans effet, pas d’avertissement sandbox', () => {
    const vars = { ...PROD, YOUSIGN_API_BASE_URL: 'https://api.yousign.app/v3' };
    const sans = loadWith(vars);
    expect(sans.exited).toBe(false);
    expect(sans.warnings).not.toContain('base SANDBOX');
    const avec = loadWith({ ...vars, YOUSIGN_ALLOW_SANDBOX: '1' });
    expect(avec.exited).toBe(false);
    expect(avec.env?.YOUSIGN_API_BASE_URL).toBe('https://api.yousign.app/v3');
    expect(avec.warnings).not.toContain('base SANDBOX');
  });

  it('hors production : pas d’avertissement sandbox, drapeau ou non', () => {
    for (const vars of [VALID, { ...VALID, YOUSIGN_ALLOW_SANDBOX: '1' }]) {
      const { exited, warnings } = loadWith(vars);
      expect(exited).toBe(false);
      expect(warnings).not.toContain('base SANDBOX');
    }
  });

  it('ne lève aucun autre contrôle : https, clé API et secret de webhook restent exigés', () => {
    const flagged = { ...PROD, YOUSIGN_ALLOW_SANDBOX: '1' };
    const http = loadWith({ ...flagged, YOUSIGN_API_BASE_URL: 'http://api-sandbox.yousign.app/v3' });
    expect(http.exited).toBe(true);
    expect(http.errors).toContain("l'URL doit être en https");
    const sansCle = loadWith({ ...flagged, YOUSIGN_API_KEY: '' });
    expect(sansCle.exited).toBe(true);
    expect(sansCle.errors).toContain('YOUSIGN_API_KEY');
    const sansSecret = loadWith({ ...flagged, YOUSIGN_WEBHOOK_SECRET: undefined });
    expect(sansSecret.exited).toBe(true);
    expect(sansSecret.errors).toContain('YOUSIGN_WEBHOOK_SECRET');
  });

  it('SMS_PROVIDER=log reste refusé en production, drapeau ou non (le staging prend orange)', () => {
    const { exited, errors } = loadWith({ ...PROD, YOUSIGN_ALLOW_SANDBOX: '1', SMS_PROVIDER: 'log' });
    expect(exited).toBe(true);
    expect(errors).toContain('SMS_PROVIDER');
  });
});
