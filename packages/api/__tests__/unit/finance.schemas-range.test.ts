/**
 * Règle de borne de fin de `resolveRange` (BUG-2026-10-01-003) : une borne
 * « jour seul » (minuit UTC pile) désigne le jour entier.
 */

import {
  accountStatementQuerySchema,
  clientsBalanceQuerySchema,
  resolveRange,
  toInclusiveRangeEnd
} from '../../src/lib/finance/schemas';

describe('resolveRange - borne de fin inclusive', () => {
  it('etend une borne a minuit UTC pile a 23:59:59.999 UTC du meme jour', () => {
    expect(resolveRange({ to: new Date('2026-09-30T00:00:00.000Z') }).to?.toISOString()).toBe(
      '2026-09-30T23:59:59.999Z'
    );
    expect(resolveRange({ periodEnd: new Date('2026-09-30T00:00:00.000Z') }).to?.toISOString()).toBe(
      '2026-09-30T23:59:59.999Z'
    );
  });

  it('laisse une borne avec heure explicite telle quelle', () => {
    const to = new Date('2026-09-30T06:30:00.000Z');
    expect(resolveRange({ to }).to?.getTime()).toBe(to.getTime());
    expect(toInclusiveRangeEnd(new Date('2026-09-30T23:59:59.999Z')).toISOString()).toBe('2026-09-30T23:59:59.999Z');
  });

  it('ne touche pas a la borne de debut et tolere l absence de bornes', () => {
    const from = new Date('2026-09-30T00:00:00.000Z');
    expect(resolveRange({ from })).toEqual({ from, to: undefined });
    expect(resolveRange({})).toEqual({ from: undefined, to: undefined });
  });

  it('accepte from = to (meme jour) et couvre le jour entier', () => {
    const query = clientsBalanceQuerySchema.parse({ from: '2026-09-30', to: '2026-09-30' });
    const { from, to } = resolveRange(query);
    expect(from?.toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(to?.toISOString()).toBe('2026-09-30T23:59:59.999Z');
    expect(() =>
      accountStatementQuerySchema.parse({ periodStart: '2026-09-30', periodEnd: '2026-09-30' })
    ).not.toThrow();
  });

  it('rejette toujours une borne de debut posterieure a la borne de fin', () => {
    expect(() => clientsBalanceQuerySchema.parse({ from: '2026-10-01', to: '2026-09-30' })).toThrow();
  });
});
