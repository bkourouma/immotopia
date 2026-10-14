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
  let simulatorAvailable: boolean | undefined;
  let thrown: unknown;
  jest.isolateModules(() => {
    try {
      const mod = require('../../src/config/env');
      env = mod.env;
      simulatorAvailable = mod.whatsappInventorySimulatorAvailable;
    } catch (e) {
      thrown = e;
    }
  });
  const result = {
    env,
    simulatorAvailable,
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

// Lot 041 — inventaire par WhatsApp : transport `log`, simulateur, vision `fake`, secrets Meta.
const META_VARS: Record<string, string> = {
  WHATSAPP_INVENTORY_TRANSPORT: 'meta',
  META_WA_APP_SECRET: 'm'.repeat(40),
  META_WA_VERIFY_TOKEN: 'v'.repeat(40),
  META_WA_ACCESS_TOKEN: 'EAAtest',
  META_WA_PHONE_NUMBER_ID: '123456789012345'
};
const WA_CLEAN: Record<string, undefined> = {
  WHATSAPP_INVENTORY_TRANSPORT: undefined,
  WHATSAPP_INVENTORY_SIMULATOR: undefined,
  STOCK_VISION_PROVIDER: undefined,
  META_WA_APP_SECRET: undefined,
  META_WA_VERIFY_TOKEN: undefined,
  META_WA_ACCESS_TOKEN: undefined,
  META_WA_PHONE_NUMBER_ID: undefined
};

describe('WHATSAPP_INVENTORY_TRANSPORT=log et simulateur (écart E1)', () => {
  it.each([
    ['absent', undefined],
    ['production', 'production']
  ])('log est refusé sans simulateur quand NODE_ENV est %s (valeur brute)', (_label, nodeEnv) => {
    const r = loadWith({ ...WA_CLEAN, NODE_ENV: nodeEnv, WHATSAPP_INVENTORY_TRANSPORT: 'log' });
    expect(r.exited).toBe(true);
    expect(r.errors).toContain('WHATSAPP_INVENTORY_TRANSPORT');
  });

  it.each(['development', 'test'])('log est accepté et ouvre le simulateur quand NODE_ENV vaut %s', nodeEnv => {
    const r = loadWith({ ...WA_CLEAN, NODE_ENV: nodeEnv, WHATSAPP_INVENTORY_TRANSPORT: 'log' });
    expect(r.exited).toBe(false);
    expect(r.simulatorAvailable).toBe(true);
  });

  it('NODE_ENV absent : le simulateur ne s’ouvre qu’avec WHATSAPP_INVENTORY_SIMULATOR=1', () => {
    const r = loadWith({
      ...WA_CLEAN,
      NODE_ENV: undefined,
      WHATSAPP_INVENTORY_TRANSPORT: 'log',
      WHATSAPP_INVENTORY_SIMULATOR: '1'
    });
    expect(r.exited).toBe(false);
    expect(r.simulatorAvailable).toBe(true);
  });

  it('le simulateur reste fermé avec le transport meta', () => {
    const r = loadWith({ ...WA_CLEAN, ...META_VARS, NODE_ENV: 'test', WHATSAPP_INVENTORY_SIMULATOR: '1' });
    expect(r.exited).toBe(false);
    expect(r.simulatorAvailable).toBe(false);
  });
});

describe('STOCK_VISION_PROVIDER=fake (W8-R9, écart E1)', () => {
  it('en production avec le simulateur : refusé avec le transport meta', () => {
    const r = loadWith({
      ...WA_CLEAN,
      ...META_VARS,
      NODE_ENV: 'production',
      WHATSAPP_INVENTORY_SIMULATOR: '1',
      STOCK_VISION_PROVIDER: 'fake'
    });
    expect(r.exited).toBe(true);
    expect(r.errors).toContain('STOCK_VISION_PROVIDER');
  });

  it('en production avec le simulateur : accepté avec le transport log (staging)', () => {
    const r = loadWith({
      ...WA_CLEAN,
      NODE_ENV: 'production',
      WHATSAPP_INVENTORY_TRANSPORT: 'log',
      WHATSAPP_INVENTORY_SIMULATOR: '1',
      STOCK_VISION_PROVIDER: 'fake'
    });
    expect(r.exited).toBe(false);
    expect(r.env?.STOCK_VISION_PROVIDER).toBe('fake');
  });

  it('NODE_ENV absent sans simulateur : refusé', () => {
    const r = loadWith({ ...WA_CLEAN, NODE_ENV: undefined, STOCK_VISION_PROVIDER: 'fake' });
    expect(r.exited).toBe(true);
    expect(r.errors).toContain('STOCK_VISION_PROVIDER');
  });

  it('NODE_ENV=test : accepté quel que soit le transport', () => {
    const r = loadWith({ ...WA_CLEAN, ...META_VARS, NODE_ENV: 'test', STOCK_VISION_PROVIDER: 'fake' });
    expect(r.exited).toBe(false);
  });
});

describe('secrets Meta (lot 041)', () => {
  it.each([
    ['META_WA_APP_SECRET', 'cle-secrete-de-l-application-meta-32-caracteres-min'],
    ['META_WA_VERIFY_TOKEN', 'jeton-de-verification-du-webhook-32-caracteres-min']
  ])('%s : la valeur d’exemple de env.example est refusée', (name, example) => {
    const r = loadWith({ ...WA_CLEAN, ...META_VARS, NODE_ENV: 'test', [name]: example });
    expect(r.exited).toBe(true);
    expect(r.errors).toContain(name);
    expect(r.errors).toContain("valeur d'exemple");
  });

  it('des secrets générés sont acceptés', () => {
    const r = loadWith({ ...WA_CLEAN, ...META_VARS, NODE_ENV: 'test' });
    expect(r.exited).toBe(false);
    expect(r.env?.WHATSAPP_INVENTORY_TRANSPORT).toBe('meta');
  });
});
