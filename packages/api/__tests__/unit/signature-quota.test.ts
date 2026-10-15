/**
 * Quota mensuel de signatures (spec 044, SG-R12) : modes enforce / warn / off,
 * réservation conditionnelle (jamais lue puis réécrite), restitution, mois
 * civil UTC, fournisseur d'usage de la capacité.
 */
const usage: Array<{ tenantId: string; month: string; used: number }> = [];
const signatureUsage = {
  createMany: jest.fn(async ({ data }: any) => {
    for (const row of data) {
      if (!usage.some(u => u.tenantId === row.tenantId && u.month === row.month)) usage.push({ ...row });
    }
    return { count: data.length };
  }),
  updateMany: jest.fn(async ({ where, data }: any) => {
    const row = usage.find(
      u =>
        u.tenantId === where.tenantId &&
        u.month === where.month &&
        (where.used?.lt === undefined || u.used < where.used.lt) &&
        (where.used?.gt === undefined || u.used > where.used.gt)
    );
    if (!row) return { count: 0 };
    row.used += data.used.increment ?? -data.used.decrement;
    return { count: 1 };
  }),
  findFirst: jest.fn(
    async ({ where }: any) => usage.find(u => u.tenantId === where.tenantId && u.month === where.month) ?? null
  )
};
jest.mock('../../src/utils/database', () => ({ prisma: { signatureUsage: signatureUsage } }));

const getEntitlements = jest.fn();
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: (...args: unknown[]) => getEntitlements(...args)
}));

import { env } from '../../src/config/env';
import {
  releaseSignature,
  reserveSignature,
  resetSignatureQuotaWarningsForTests,
  resolveSignatureQuotaPolicy,
  signatureQuotaMonth
} from '../../src/lib/signature/quota';
import { CAPACITY_KEYS } from '../../src/lib/subscription/catalog';

const entitlements = (enforcement: string, limit: number) => ({
  enforcement,
  capacities: { SIGNATURES_MENSUELLES: { limit } }
});

beforeEach(() => {
  usage.length = 0;
  jest.clearAllMocks();
  resetSignatureQuotaWarningsForTests();
});

describe('politique du quota', () => {
  it('enforce : refus sans capacité, plafond de la capacité sinon', async () => {
    getEntitlements.mockResolvedValueOnce(entitlements('enforce', 0));
    expect(await resolveSignatureQuotaPolicy('t1')).toEqual({ ok: false, reason: 'OPTION_MISSING' });
    getEntitlements.mockResolvedValueOnce(entitlements('enforce', 30));
    expect(await resolveSignatureQuotaPolicy('t1')).toEqual({ ok: true, limit: 30, source: 'OPTION' });
  });

  it('warn et off : quota de secours sans capacité, la capacité souscrite reste appliquée', async () => {
    getEntitlements.mockResolvedValueOnce(entitlements('warn', 0));
    expect(await resolveSignatureQuotaPolicy('t1')).toEqual({
      ok: true,
      limit: env.SIGNATURE_WARN_QUOTA,
      source: 'WARN_FALLBACK'
    });
    getEntitlements.mockResolvedValueOnce(entitlements('off', 0));
    expect(await resolveSignatureQuotaPolicy('t1')).toMatchObject({ ok: true, source: 'OFF_FALLBACK' });
    getEntitlements.mockResolvedValueOnce(entitlements('warn', 12));
    expect(await resolveSignatureQuotaPolicy('t1')).toEqual({ ok: true, limit: 12, source: 'OPTION' });
  });

  it('la capacité est déclarée au catalogue des abonnements', () => {
    expect(CAPACITY_KEYS).toContain('SIGNATURES_MENSUELLES');
  });
});

describe('réservation atomique', () => {
  it('réserve jusqu’au plafond puis refuse, par agence et par mois', async () => {
    const now = new Date(Date.UTC(2026, 9, 15));
    expect((await reserveSignature('t1', 2, now)).ok).toBe(true);
    expect((await reserveSignature('t1', 2, now)).ok).toBe(true);
    expect((await reserveSignature('t1', 2, now)).ok).toBe(false);
    expect((await reserveSignature('t2', 2, now)).ok).toBe(true);
    expect((await reserveSignature('t1', 2, new Date(Date.UTC(2026, 10, 1)))).ok).toBe(true);
    expect(signatureQuotaMonth(now)).toBe('2026-10');
  });

  it('refuse sans écrire quand le plafond est nul', async () => {
    expect((await reserveSignature('t1', 0)).ok).toBe(false);
    expect(signatureUsage.updateMany).not.toHaveBeenCalled();
  });

  it('la mise à jour est conditionnelle (used < limit), jamais lue puis réécrite', async () => {
    await reserveSignature('t1', 5);
    expect(signatureUsage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ used: { lt: 5 } }), data: { used: { increment: 1 } } })
    );
    expect(signatureUsage.findFirst).not.toHaveBeenCalled();
  });

  it('rend une réservation sans descendre sous zéro', async () => {
    const now = new Date();
    const { month } = await reserveSignature('t1', 3, now);
    await releaseSignature('t1', month);
    await releaseSignature('t1', month);
    expect(usage.find(u => u.tenantId === 't1')?.used).toBe(0);
  });
});
