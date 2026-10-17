/**
 * Chiffrement des IBAN des mandats (spec 042, PB2-R4) : clé dédiée, format
 * ddk1 versionné, rotation, lecture héritée pg1, et validation de
 * l'environnement.
 */
import { createCipheriv, createHash, randomBytes } from 'crypto';

jest.mock('dotenv/config', () => ({}));
const mockWarn = jest.fn();
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: (...args: unknown[]) => mockWarn(...args), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

type IbanCrypto = typeof import('../../src/lib/direct-debit/iban-crypto');

const IBAN = 'CI93CI0080111301134291200589';
const UNREADABLE = 'Les coordonnées bancaires de ce mandat ne peuvent pas être lues.';
const saved = { ...process.env };
const newKey = () => randomBytes(32).toString('base64');

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(48),
  FRONTEND_URL: 'https://app.example.com',
  BACKEND_URL: 'https://api.example.com'
};

interface Config {
  current?: string;
  previous?: string;
  payment?: string;
}

function setEnv(config: Config) {
  process.env = { ...saved, ...BASE_ENV };
  delete process.env.DIRECT_DEBIT_IBAN_KEY;
  delete process.env.DIRECT_DEBIT_IBAN_PREVIOUS_KEYS;
  delete process.env.PAYMENT_SECRETS_KEY;
  if (config.current !== undefined) process.env.DIRECT_DEBIT_IBAN_KEY = config.current;
  if (config.previous !== undefined) process.env.DIRECT_DEBIT_IBAN_PREVIOUS_KEYS = config.previous;
  if (config.payment !== undefined) process.env.PAYMENT_SECRETS_KEY = config.payment;
}

function load(config: Config): IbanCrypto {
  setEnv(config);
  let mod: IbanCrypto | undefined;
  jest.isolateModules(() => {
    mod = require('../../src/lib/direct-debit/iban-crypto');
  });
  return mod!;
}

function loadLegacy(payment: string) {
  setEnv({ payment });
  let mod: typeof import('../../src/lib/payment-gateway/crypto') | undefined;
  jest.isolateModules(() => {
    mod = require('../../src/lib/payment-gateway/crypto');
  });
  return mod!;
}

function loadEnvOutcome(config: Config) {
  setEnv(config);
  const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit');
  }) as never);
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    jest.isolateModules(() => {
      try {
        require('../../src/config/env');
      } catch {
        // process.exit simulé : configuration refusée.
      }
    });
    return { exited: exit.mock.calls.length > 0, errors: error.mock.calls.flat().join('\n') };
  } finally {
    jest.restoreAllMocks();
  }
}

afterAll(() => {
  process.env = saved;
});

describe('iban-crypto (ddk1)', () => {
  it('chiffre et déchiffre à l’identique, avec un IV neuf à chaque appel et le format ddk1', () => {
    const c = load({ current: newKey() });
    expect(c.isIbanEncryptionAvailable()).toBe(true);
    const a = c.encryptIban(IBAN);
    const b = c.encryptIban(IBAN);
    expect(a).toMatch(/^ddk1:[0-9a-f]{16}:[^:]+:[^:]+:[^:]+$/);
    expect(a.split(':')[1]).toBe(c.currentIbanKeyId());
    expect(a).not.toContain(IBAN);
    expect(a).not.toBe(b);
    expect(c.decryptIban(a)).toBe(IBAN);
    expect(c.decryptIban(b)).toBe(IBAN);
    expect(c.describeIbanCiphertext(a)).toEqual({ kind: 'CURRENT', keyId: c.currentIbanKeyId() });
    expect(c.needsIbanReencryption(a)).toBe(false);
  });

  it('refuse de chiffrer sans clé courante, avec le message traduit', () => {
    const c = load({});
    expect(c.isIbanEncryptionAvailable()).toBe(false);
    expect(c.currentIbanKeyId()).toBeNull();
    expect(() => c.encryptIban(IBAN)).toThrow(
      "Le chiffrement des coordonnées bancaires n'est pas configuré sur ce serveur."
    );
  });

  it('rotation : une valeur de l’ancienne clé reste lisible et doit être rechiffrée', () => {
    const keyA = newKey();
    const old = load({ current: keyA }).encryptIban(IBAN);
    const c = load({ current: newKey(), previous: ` ${keyA} , ,` });
    expect(c.decryptIban(old)).toBe(IBAN);
    expect(c.describeIbanCiphertext(old).kind).toBe('PREVIOUS_KEY');
    expect(c.needsIbanReencryption(old)).toBe(true);
    const fresh = c.encryptIban(IBAN);
    expect(c.describeIbanCiphertext(fresh).kind).toBe('CURRENT');
    expect(fresh.split(':')[1]).not.toBe(old.split(':')[1]);
  });

  it('repli en lecture : une valeur pg1 se déchiffre avec PAYMENT_SECRETS_KEY, sans clé courante requise', () => {
    const payment = newKey();
    const legacy = loadLegacy(payment).encryptSecret(IBAN);
    const c = load({ payment });
    expect(c.describeIbanCiphertext(legacy)).toEqual({ kind: 'LEGACY_PAYMENT_KEY', keyId: null });
    expect(c.needsIbanReencryption(legacy)).toBe(true);
    expect(c.decryptIban(legacy)).toBe(IBAN);
    const withCurrent = load({ payment, current: newKey() });
    expect(withCurrent.decryptIban(legacy)).toBe(IBAN);
    expect(withCurrent.encryptIban(IBAN).startsWith('ddk1:')).toBe(true);
  });

  it('une valeur pg1 sans PAYMENT_SECRETS_KEY est illisible', () => {
    const legacy = loadLegacy(newKey()).encryptSecret(IBAN);
    const c = load({ current: newKey() });
    expect(() => c.decryptIban(legacy)).toThrow(UNREADABLE);
  });

  it('clé inconnue, altération, format inconnu : même erreur, sans détail', () => {
    const c = load({ current: newKey() });
    const value = c.encryptIban(IBAN);
    const other = load({ current: newKey() }).encryptIban(IBAN);
    const [p, id, iv, tag, ct] = value.split(':');
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 1;
    const cases = [other, [p, id, iv, tag, flipped.toString('base64')].join(':'), 'ddk2:x:y:z:w', 'format libre', ''];
    for (const bad of cases) {
      let message = '';
      try {
        c.decryptIban(bad);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toBe(UNREADABLE);
      expect(message).not.toContain(IBAN);
    }
    expect(c.describeIbanCiphertext(other).kind).toBe('UNKNOWN_KEY');
    expect(c.describeIbanCiphertext('format libre')).toEqual({ kind: 'INVALID', keyId: null });
  });

  it('AAD : changer le keyId d’une valeur la rend illisible, même si la clé est au trousseau', () => {
    const keyA = newKey();
    const keyB = newKey();
    const a = load({ current: keyA });
    const idA = a.currentIbanKeyId()!;
    const idB = load({ current: keyB }).currentIbanKeyId()!;
    const value = a.encryptIban(IBAN);
    const forged = value.replace(`:${idA}:`, `:${idB}:`);
    const both = load({ current: keyA, previous: keyB });
    expect(() => both.decryptIban(forged)).toThrow(UNREADABLE);
    expect(both.decryptIban(value)).toBe(IBAN);
  });

  it('l’identifiant de clé suit sa définition (sha256 préfixé, 16 hex)', () => {
    const key = randomBytes(32);
    const c = load({ current: key.toString('base64') });
    const expected = createHash('sha256')
      .update(Buffer.concat([Buffer.from('immotopia:direct-debit-iban:key-id:'), key]))
      .digest('hex')
      .slice(0, 16);
    expect(c.currentIbanKeyId()).toBe(expected);
  });

  it('une valeur ddk1 chiffrée sans les données associées est refusée', () => {
    const key = randomBytes(32);
    const c = load({ current: key.toString('base64') });
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(IBAN, 'utf8'), cipher.final()]);
    const bad = [
      'ddk1',
      c.currentIbanKeyId(),
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ct.toString('base64')
    ].join(':');
    expect(() => c.decryptIban(bad)).toThrow(UNREADABLE);
  });
});

describe('iban-crypto : GCM strict et journal de cause', () => {
  beforeEach(() => mockWarn.mockClear());

  it('une balise tronquée à 4 octets ou un IV de mauvaise taille est refusé', () => {
    const c = load({ current: newKey() });
    const [p, id, iv, tag, ct] = c.encryptIban(IBAN).split(':');
    const shortTag = Buffer.from(tag, 'base64').subarray(0, 4).toString('base64');
    const shortIv = Buffer.from(iv, 'base64').subarray(0, 8).toString('base64');
    expect(() => c.decryptIban([p, id, iv, shortTag, ct].join(':'))).toThrow(UNREADABLE);
    expect(() => c.decryptIban([p, id, shortIv, tag, ct].join(':'))).toThrow(UNREADABLE);
    expect(c.decryptIban([p, id, iv, tag, ct].join(':'))).toBe(IBAN);
  });

  it('journalise seulement un code de cause, sans IBAN, chiffré ni identifiant de clé', () => {
    const c = load({ current: newKey() });
    const value = c.encryptIban(IBAN);
    const [p, id, iv, tag, ct] = value.split(':');
    const other = load({ current: newKey() }).encryptIban(IBAN);
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 1;
    const legacy = loadLegacy(newKey()).encryptSecret(IBAN);
    const cases: Array<[string, string]> = [
      ['format libre', 'FORMAT'],
      [other, 'KEY_UNKNOWN'],
      [[p, id, iv, tag, flipped.toString('base64')].join(':'), 'AUTH_FAILED'],
      [legacy, 'LEGACY_KEY_MISSING']
    ];
    for (const [bad, cause] of cases) {
      mockWarn.mockClear();
      expect(() => c.decryptIban(bad)).toThrow(UNREADABLE);
      expect(mockWarn).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(mockWarn.mock.calls);
      expect(logged).toContain(cause);
      for (const secret of [IBAN, bad, value, id, ct, tag]) expect(logged).not.toContain(secret);
    }
  });
});

describe('validation de l’environnement des clés IBAN', () => {
  it('refuse une clé faible ou non canonique, sans afficher la valeur', () => {
    const weak = Buffer.alloc(32, 7).toString('base64');
    const urlSafe = Buffer.alloc(32, 0xfb).toString('base64url');
    const spaced = ` ${newKey()}`;
    for (const bad of [weak, urlSafe, spaced]) {
      const out = loadEnvOutcome({ current: bad });
      expect(out.exited).toBe(true);
      expect(out.errors).toContain('DIRECT_DEBIT_IBAN_KEY');
      expect(out.errors).not.toContain(bad.trim());
    }
    const prev = loadEnvOutcome({ current: newKey(), previous: `${newKey()},${weak}` });
    expect(prev.exited).toBe(true);
    expect(prev.errors).toContain('n°2');
    expect(prev.errors).not.toContain(weak);
  });

  it('accepte l’absence, une chaîne vide et une clé valide avec trousseau', () => {
    expect(loadEnvOutcome({}).exited).toBe(false);
    expect(loadEnvOutcome({ current: '', previous: '' }).exited).toBe(false);
    expect(loadEnvOutcome({ current: newKey(), previous: `${newKey()}, ${newKey()},`, payment: newKey() }).exited).toBe(
      false
    );
  });

  it('refuse une clé de mauvaise longueur', () => {
    const out = loadEnvOutcome({ current: Buffer.from('trop-court').toString('base64') });
    expect(out.exited).toBe(true);
    expect(out.errors).toContain('DIRECT_DEBIT_IBAN_KEY');
  });

  it('refuse un trousseau avec une entrée invalide, sans afficher la valeur', () => {
    const out = loadEnvOutcome({ current: newKey(), previous: `${newKey()},secret-invalide-xyz` });
    expect(out.exited).toBe(true);
    expect(out.errors).toContain('DIRECT_DEBIT_IBAN_PREVIOUS_KEYS');
    expect(out.errors).not.toContain('secret-invalide-xyz');
  });

  it('refuse une clé identique à PAYMENT_SECRETS_KEY, sans afficher la valeur', () => {
    const shared = newKey();
    const out = loadEnvOutcome({ current: shared, payment: shared });
    expect(out.exited).toBe(true);
    expect(out.errors).toContain('PAYMENT_SECRETS_KEY');
    expect(out.errors).not.toContain(shared);
  });
});
