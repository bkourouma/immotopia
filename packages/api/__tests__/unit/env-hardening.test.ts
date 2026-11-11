/**
 * config/env.ts — durcissement (audit sécurité 2026-11-09) :
 * AUTH-08 (JWT_EXPIRES_IN borné), AUTH-11 (URL locales refusées en production),
 * SUR-05 (variables de messagerie déclarées, chaîne vide = absente).
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
  'NODE_ENV',
  'JWT_EXPIRES_IN',
  'CLIENT_URL',
  'API_URL',
  'EMAIL_SMTP_HOST',
  'EMAIL_SMTP_PORT',
  'EMAIL_SMTP_SECURE',
  'EMAIL_SMTP_PASS',
  'ENABLE_EMAILS',
  'NEWSLETTER_WHATSAPP_ENABLED'
];
const saved = { ...process.env };

function loadWith(vars: Record<string, string | undefined>) {
  process.env = { ...saved, ...BASE_ENV };
  for (const key of KEYS) delete process.env[key];
  process.env.NODE_ENV = 'test';
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

describe('AUTH-08 : JWT_EXPIRES_IN borné à 30 minutes', () => {
  it.each(['15m', '30m', '1800s', '900s', '1800000ms'])('accepte %s', value => {
    const { env, exited } = loadWith({ JWT_EXPIRES_IN: value });
    expect(exited).toBe(false);
    expect(env?.JWT_EXPIRES_IN).toBe(value);
  });

  it('garde 15m par défaut, y compris quand la variable est vide', () => {
    expect(loadWith({}).env?.JWT_EXPIRES_IN).toBe('15m');
    expect(loadWith({ JWT_EXPIRES_IN: '' }).env?.JWT_EXPIRES_IN).toBe('15m');
  });

  it.each(['900', '1800'])('refuse %s (sans unite : jsonwebtoken le lirait en millisecondes)', value => {
    const { exited, errors } = loadWith({ JWT_EXPIRES_IN: value });
    expect(exited).toBe(true);
    expect(errors).toContain('JWT_EXPIRES_IN');
  });

  it.each(['1h', '2d', '45m', '31m', '1801s'])('refuse %s (trop long)', value => {
    const { exited, errors } = loadWith({ JWT_EXPIRES_IN: value });
    expect(exited).toBe(true);
    expect(errors).toContain('JWT_EXPIRES_IN');
    expect(errors).toContain('30 minutes');
  });

  it.each(['abc', '15 minutes', '-5m', '0m'])('refuse %s (illisible ou nul)', value => {
    const { exited, errors } = loadWith({ JWT_EXPIRES_IN: value });
    expect(exited).toBe(true);
    expect(errors).toContain('JWT_EXPIRES_IN');
  });

  // Contre-audit PR #205 : `ms` (appelé par jsonwebtoken) refuse les blancs de bord.
  it.each([' 15m', '15m ', '\t15m', '15m\n', '15\tm'])('refuse %j au démarrage (blanc refusé par ms)', value => {
    const { exited, errors } = loadWith({ JWT_EXPIRES_IN: value });
    expect(exited).toBe(true);
    expect(errors).toContain('JWT_EXPIRES_IN');
    expect(errors).toContain('sans espace');
  });

  it('toute valeur acceptée est lisible par ms (jamais undefined pour jwt.sign)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ms = require('ms') as (value: string) => number | undefined;
    process.env = { ...saved, ...BASE_ENV, NODE_ENV: 'test' };
    delete process.env.JWT_EXPIRES_IN;
    let parseDurationMs: (raw: string) => number | null = () => null;
    jest.isolateModules(() => {
      parseDurationMs = (require('../../src/config/env') as typeof import('../../src/config/env')).parseDurationMs;
    });
    const candidates = ['15m', '15 m', '15M', '1.5m', '900s', '1800000ms', '30m', '2w', ' 15m', '15m ', '15\tm', 'x'];
    for (const value of candidates) {
      const parsed = parseDurationMs(value);
      if (parsed !== null) expect(ms(value)).toBe(parsed);
    }
    expect(parseDurationMs('15m')).toBe(15 * 60 * 1000);
    expect(parseDurationMs(`${'1'.repeat(100)}m`)).toBeNull();
  });
});

describe('AUTH-11 : URL locales refusées en production', () => {
  const prod = { NODE_ENV: 'production' };

  it('refuse FRONTEND_URL sur localhost en production', () => {
    const { exited, errors } = loadWith({ ...prod, FRONTEND_URL: 'http://localhost:3000' });
    expect(exited).toBe(true);
    expect(errors).toContain('FRONTEND_URL');
  });

  it('refuse BACKEND_URL sur 127.0.0.1 en production', () => {
    const { exited, errors } = loadWith({ ...prod, BACKEND_URL: 'http://127.0.0.1:8001' });
    expect(exited).toBe(true);
    expect(errors).toContain('BACKEND_URL');
  });

  it.each(['http://[::1]:3000', 'http://0.0.0.0:3000', 'http://LOCALHOST:3000'])(
    'refuse CLIENT_URL=%s en production',
    url => {
      const { exited, errors } = loadWith({ ...prod, CLIENT_URL: url });
      expect(exited).toBe(true);
      expect(errors).toContain('CLIENT_URL');
    }
  );

  it('ne confond pas un domaine public qui contient « localhost » avec la machine locale', () => {
    const { exited } = loadWith({ ...prod, FRONTEND_URL: 'https://localhost.example.com' });
    expect(exited).toBe(false);
  });

  it('accepte des URL publiques en https en production', () => {
    const { env, exited } = loadWith({ ...prod, CLIENT_URL: 'https://app.example.com' });
    expect(exited).toBe(false);
    expect(env?.FRONTEND_URL).toBe('https://app.example.com');
  });

  it('accepte localhost hors production', () => {
    const { exited } = loadWith({ FRONTEND_URL: 'http://localhost:3000', BACKEND_URL: 'http://127.0.0.1:8001' });
    expect(exited).toBe(false);
  });
});

describe('SUR-05 : variables de messagerie déclarées', () => {
  it('charge sans aucune variable e-mail (aucun défaut inventé)', () => {
    const { env, exited } = loadWith({});
    expect(exited).toBe(false);
    expect(env?.EMAIL_SMTP_HOST).toBeUndefined();
    expect(env?.EMAIL_SMTP_PASS).toBeUndefined();
    expect(env?.EMAIL_SMTP_PORT).toBeUndefined();
    expect(env?.EMAIL_SMTP_SECURE).toBe(false);
    expect(env?.ENABLE_EMAILS).toBe(false);
    expect(env?.NEWSLETTER_WHATSAPP_ENABLED).toBe(true);
  });

  it('EMAIL_SMTP_HOST vide est accepté et vaut absent', () => {
    const { env, exited } = loadWith({ EMAIL_SMTP_HOST: '', EMAIL_SMTP_PASS: '' });
    expect(exited).toBe(false);
    expect(env?.EMAIL_SMTP_HOST).toBeUndefined();
    expect(env?.EMAIL_SMTP_PASS).toBeUndefined();
  });

  it('EMAIL_SMTP_HOST renseigné est conservé tel quel', () => {
    expect(loadWith({ EMAIL_SMTP_HOST: 'smtp.example.com' }).env?.EMAIL_SMTP_HOST).toBe('smtp.example.com');
  });

  it('EMAIL_SMTP_PORT : vide accepté, 587 numérique, texte refusé, hors plage refusé', () => {
    const empty = loadWith({ EMAIL_SMTP_PORT: '' });
    expect(empty.exited).toBe(false);
    expect(empty.env?.EMAIL_SMTP_PORT).toBeUndefined();
    expect(loadWith({ EMAIL_SMTP_PORT: '587' }).env?.EMAIL_SMTP_PORT).toBe(587);
    const text = loadWith({ EMAIL_SMTP_PORT: 'abc' });
    expect(text.exited).toBe(true);
    expect(text.errors).toContain('EMAIL_SMTP_PORT');
    expect(loadWith({ EMAIL_SMTP_PORT: '70000' }).exited).toBe(true);
    expect(loadWith({ EMAIL_SMTP_PORT: '0' }).exited).toBe(true);
  });

  it("EMAIL_SMTP_SECURE : seul 'true' vaut vrai, jamais de refus", () => {
    expect(loadWith({ EMAIL_SMTP_SECURE: 'true' }).env?.EMAIL_SMTP_SECURE).toBe(true);
    for (const other of ['TRUE', '1', 'oui', '']) {
      const result = loadWith({ EMAIL_SMTP_SECURE: other });
      expect(result.exited).toBe(false);
      expect(result.env?.EMAIL_SMTP_SECURE).toBe(false);
    }
  });

  it("ENABLE_EMAILS : '1', 'true', 'TRUE' => true ; '0' et vide => false", () => {
    for (const on of ['1', 'true', 'TRUE']) expect(loadWith({ ENABLE_EMAILS: on }).env?.ENABLE_EMAILS).toBe(true);
    for (const off of ['0', '', 'false', 'yes'])
      expect(loadWith({ ENABLE_EMAILS: off }).env?.ENABLE_EMAILS).toBe(false);
  });

  it('NEWSLETTER_WHATSAPP_ENABLED garde la sémantique historique', () => {
    expect(loadWith({ NEWSLETTER_WHATSAPP_ENABLED: '' }).env?.NEWSLETTER_WHATSAPP_ENABLED).toBe(true);
    expect(loadWith({ NEWSLETTER_WHATSAPP_ENABLED: ' On ' }).env?.NEWSLETTER_WHATSAPP_ENABLED).toBe(true);
    expect(loadWith({ NEWSLETTER_WHATSAPP_ENABLED: '0' }).env?.NEWSLETTER_WHATSAPP_ENABLED).toBe(false);
  });

  it('PORT et API_URL vides valent absents', () => {
    const { env, exited } = loadWith({ API_URL: '' });
    expect(exited).toBe(false);
    expect(env?.API_URL).toBeUndefined();
    expect(env?.PORT).toBe(8001);
  });
});
