/**
 * Rechiffrement des IBAN des mandats (spec 042, PB2-R4) : idempotence,
 * dry-run, illisibles, concurrence. Prisma est simulé.
 */
import { randomBytes } from 'crypto';

jest.mock('dotenv/config', () => ({}));

const IBAN = 'CI93CI0080111301134291200589';
type Row = { id: string; ibanEncrypted: string; updatedAt: Date };
const T0 = new Date('2026-01-01T00:00:00.000Z');
const state: { rows: Row[]; raceOn?: string } = { rows: [] };

const mockDb = {
  directDebitMandate: {
    findMany: jest.fn(async ({ where, take }: { where: { id?: { gt: string } }; take: number }) =>
      [...state.rows]
        .sort((a, b) => a.id.localeCompare(b.id))
        .filter(r => !where.id || r.id > where.id.gt)
        .slice(0, take)
        .map(r => ({ ...r }))
    ),
    updateMany: jest.fn(
      async ({
        where,
        data
      }: {
        where: { id: string; ibanEncrypted: string };
        data: { ibanEncrypted: string; updatedAt: Date };
      }) => {
        if (state.raceOn === where.id) {
          state.rows.find(r => r.id === where.id)!.ibanEncrypted = 'modifié ailleurs';
        }
        const row = state.rows.find(r => r.id === where.id && r.ibanEncrypted === where.ibanEncrypted);
        if (!row) return { count: 0 };
        row.ibanEncrypted = data.ibanEncrypted;
        row.updatedAt = data.updatedAt;
        return { count: 1 };
      }
    )
  }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockDb }));

const saved = { ...process.env };
const newKey = () => randomBytes(32).toString('base64');
const BASE_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(48),
  FRONTEND_URL: 'https://app.example.com',
  BACKEND_URL: 'https://api.example.com'
};

function setEnv(v: { current?: string; previous?: string; payment?: string }) {
  process.env = { ...saved, ...BASE_ENV };
  delete process.env.DIRECT_DEBIT_IBAN_KEY;
  delete process.env.DIRECT_DEBIT_IBAN_PREVIOUS_KEYS;
  delete process.env.PAYMENT_SECRETS_KEY;
  if (v.current) process.env.DIRECT_DEBIT_IBAN_KEY = v.current;
  if (v.previous) process.env.DIRECT_DEBIT_IBAN_PREVIOUS_KEYS = v.previous;
  if (v.payment) process.env.PAYMENT_SECRETS_KEY = v.payment;
}

function mods(v: Parameters<typeof setEnv>[0]) {
  setEnv(v);
  let out!: {
    crypto: typeof import('../../src/lib/direct-debit/iban-crypto');
    legacy: typeof import('../../src/lib/payment-gateway/crypto');
    svc: typeof import('../../src/lib/direct-debit/iban-reencryption');
  };
  jest.isolateModules(() => {
    out = {
      crypto: require('../../src/lib/direct-debit/iban-crypto'),
      legacy: require('../../src/lib/payment-gateway/crypto'),
      svc: require('../../src/lib/direct-debit/iban-reencryption')
    };
  });
  return out;
}

afterAll(() => {
  process.env = saved;
});
beforeEach(() => {
  state.rows = [];
  state.raceOn = undefined;
  jest.clearAllMocks();
});

describe('reencryptMandateIbans', () => {
  const keyA = newKey();
  const keyB = newKey();
  const payment = newKey();

  function seed() {
    const a = mods({ current: keyA });
    const legacy = mods({ payment }).legacy;
    const b = mods({ current: keyB, previous: keyA, payment });
    state.rows = [
      { id: 'm1', updatedAt: T0, ibanEncrypted: a.crypto.encryptIban(IBAN) },
      { id: 'm2', updatedAt: T0, ibanEncrypted: legacy.encryptSecret(IBAN) },
      { id: 'm3', updatedAt: T0, ibanEncrypted: b.crypto.encryptIban(IBAN) },
      { id: 'm4', updatedAt: T0, ibanEncrypted: 'ddk1:0000000000000000:aaa:bbb:ccc' },
      { id: 'm5', updatedAt: T0, ibanEncrypted: a.crypto.encryptIban(IBAN) }
    ];
    return b;
  }

  it('exige la clé courante', async () => {
    const m = mods({});
    await expect(m.svc.reencryptMandateIbans({ dryRun: false })).rejects.toThrow('DIRECT_DEBIT_IBAN_KEY');
  });

  it('dry-run : compte sans rien écrire', async () => {
    const b = seed();
    const before = JSON.stringify(state.rows);
    const result = await b.svc.reencryptMandateIbans({ dryRun: true, batchSize: 2 });
    expect(result).toEqual({
      scanned: 5,
      alreadyCurrent: 1,
      reencrypted: 3,
      unreadableIds: ['m4'],
      changedConcurrently: 0
    });
    expect(mockDb.directDebitMandate.updateMany).not.toHaveBeenCalled();
    expect(JSON.stringify(state.rows)).toBe(before);
  });

  it('rechiffre les pg1 et l’ancienne clé, est idempotent, et ne montre aucun IBAN', async () => {
    const b = seed();
    const result = await b.svc.reencryptMandateIbans({ dryRun: false, batchSize: 2 });
    expect(result.reencrypted).toBe(3);
    expect(result.unreadableIds).toEqual(['m4']);
    for (const id of ['m1', 'm2', 'm3', 'm5']) {
      const row = state.rows.find(r => r.id === id)!;
      expect(b.crypto.describeIbanCiphertext(row.ibanEncrypted).kind).toBe('CURRENT');
      expect(b.crypto.decryptIban(row.ibanEncrypted)).toBe(IBAN);
    }
    expect(JSON.stringify(result)).not.toContain(IBAN);
    // updatedAt préservé par l'écriture.
    expect(state.rows.every(r => r.updatedAt === T0)).toBe(true);
    expect(mockDb.directDebitMandate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ updatedAt: T0 }) })
    );

    const second = await b.svc.reencryptMandateIbans({ dryRun: false });
    expect(second.reencrypted).toBe(0);
    expect(second.alreadyCurrent).toBe(4);
    expect(second.unreadableIds).toEqual(['m4']);
  });

  it('une valeur modifiée entre-temps (0 ligne) est comptée, pas écrasée', async () => {
    const b = seed();
    state.raceOn = 'm2';
    const result = await b.svc.reencryptMandateIbans({ dryRun: false });
    expect(result.changedConcurrently).toBe(1);
    expect(result.reencrypted).toBe(2);
    expect(state.rows.find(r => r.id === 'm2')!.ibanEncrypted).toBe('modifié ailleurs');
  });

  it('une valeur courante altérée est signalée illisible, sans être réécrite', async () => {
    const b = seed();
    const row = state.rows.find(r => r.id === 'm3')!;
    const parts = row.ibanEncrypted.split(':');
    const ct = Buffer.from(parts[4], 'base64');
    ct[0] ^= 1;
    parts[4] = ct.toString('base64');
    row.ibanEncrypted = parts.join(':');
    const tampered = row.ibanEncrypted;
    const result = await b.svc.reencryptMandateIbans({ dryRun: true });
    expect(result.unreadableIds.sort()).toEqual(['m3', 'm4']);
    expect(result.alreadyCurrent).toBe(0);
    expect(row.ibanEncrypted).toBe(tampered);
  });
});
