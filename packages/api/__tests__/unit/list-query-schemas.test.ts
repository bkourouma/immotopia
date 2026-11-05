/** Briques Zod partagées des listes filtrables (recherche, CSV, jours, montants, ids). */
import { z } from 'zod';
import {
  emptyToUndefined,
  zSearch,
  zCsvEnum,
  zDay,
  dayStart,
  dayEnd,
  dayRange,
  dayOrderRefinement,
  zAmount,
  zId
} from '../../src/utils/list-query-schemas';

const STATUSES = ['DRAFT', 'PAID', 'VOID'] as const;
const ok = (schema: z.ZodTypeAny, value: unknown) => {
  const r = schema.safeParse(value);
  expect(r.success).toBe(true);
  return (r as { data: unknown }).data;
};
const ko = (schema: z.ZodTypeAny, value: unknown) => expect(schema.safeParse(value).success).toBe(false);

describe('emptyToUndefined', () => {
  it('vide et espaces donnent undefined, le reste passe', () => {
    expect(emptyToUndefined('')).toBeUndefined();
    expect(emptyToUndefined('  ')).toBeUndefined();
    expect(emptyToUndefined('a')).toBe('a');
    expect(emptyToUndefined(undefined)).toBeUndefined();
  });
});

describe('zSearch', () => {
  it('trim, vide -> undefined, longueur max', () => {
    expect(ok(zSearch(), '  aya ')).toBe('aya');
    expect(ok(zSearch(), '  ')).toBeUndefined();
    expect(ok(zSearch(), undefined)).toBeUndefined();
    ok(zSearch(), 'a'.repeat(200));
    ko(zSearch(), 'a'.repeat(201));
    ko(zSearch(5), 'abcdef');
  });
  it('refuse un tableau', () => ko(zSearch(), ['a', 'b']));
});

describe('zCsvEnum', () => {
  const schema = zCsvEnum(STATUSES);
  it('liste, doublons et espaces ignorés', () => {
    expect(ok(schema, 'DRAFT, PAID ,DRAFT')).toEqual(['DRAFT', 'PAID']);
    expect(ok(schema, 'PAID')).toEqual(['PAID']);
  });
  it('vide -> undefined', () => {
    expect(ok(schema, '')).toBeUndefined();
    expect(ok(schema, undefined)).toBeUndefined();
    expect(ok(schema, ' , ')).toBeUndefined();
  });
  it('valeur inconnue ou tableau : erreur', () => {
    ko(schema, 'DRAFT,BOGUS');
    ko(schema, ['DRAFT', 'PAID']);
  });
});

describe('zDay', () => {
  it.each(['2026-02-28', '2024-02-29', '2026-12-31'])('accepte %s', day => {
    expect(ok(zDay, day)).toBe(day);
  });
  it.each(['2026-02-29', '2026-02-31', '2026-13-45', '2026-1-5', '2026-04-31', 'abc', '2026-00-10', '26-01-01'])(
    'refuse %s',
    day => ko(zDay, day)
  );
  it('vide -> undefined', () => {
    expect(ok(zDay, '')).toBeUndefined();
    expect(ok(zDay, undefined)).toBeUndefined();
  });
});

describe('dayStart / dayEnd / dayRange', () => {
  it('bornes UTC, fin inclusive', () => {
    expect(dayStart('2026-03-05').toISOString()).toBe('2026-03-05T00:00:00.000Z');
    expect(dayEnd('2026-03-05').toISOString()).toBe('2026-03-05T23:59:59.999Z');
  });
  it('intervalle selon les bornes présentes', () => {
    expect(dayRange()).toBeUndefined();
    expect(dayRange(undefined, undefined)).toBeUndefined();
    expect(dayRange('2026-03-01')).toEqual({ gte: dayStart('2026-03-01') });
    expect(dayRange(undefined, '2026-03-31')).toEqual({ lte: dayEnd('2026-03-31') });
    expect(dayRange('2026-03-01', '2026-03-31')).toEqual({ gte: dayStart('2026-03-01'), lte: dayEnd('2026-03-31') });
    expect(dayRange('2026-03-01', '2026-03-01')).toEqual({ gte: dayStart('2026-03-01'), lte: dayEnd('2026-03-01') });
  });
});

describe('dayOrderRefinement', () => {
  const schema = z.object({ from: zDay, to: zDay }).superRefine(dayOrderRefinement('from', 'to'));
  it('accepte début <= fin, ou une borne seule', () => {
    ok(schema, { from: '2026-03-01', to: '2026-03-01' });
    ok(schema, { from: '2026-03-01' });
    ok(schema, { to: '2026-03-01' });
  });
  it('refuse début > fin, erreur sur le champ de fin', () => {
    const r = schema.safeParse({ from: '2026-03-02', to: '2026-03-01' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['to']);
  });
});

describe('zAmount', () => {
  it('nombre, négatif accepté par défaut, vide -> undefined', () => {
    expect(ok(zAmount(), '12.5')).toBe(12.5);
    expect(ok(zAmount(), '0')).toBe(0);
    expect(ok(zAmount(), '-3')).toBe(-3);
    expect(ok(zAmount(), '')).toBeUndefined();
    expect(ok(zAmount(), undefined)).toBeUndefined();
  });
  it('refuse le non numérique', () => {
    ko(zAmount(), 'abc');
    ko(zAmount(), '12abc');
    ko(zAmount(), 'Infinity');
    ko(zAmount(), 'NaN');
  });
  it('{ min: 0 } interdit le négatif, max respecté', () => {
    ko(zAmount({ min: 0 }), '-1');
    expect(ok(zAmount({ min: 0 }), '0')).toBe(0);
    ko(zAmount({ max: 100 }), '101');
    expect(ok(zAmount({ max: 100 }), '100')).toBe(100);
  });
});

describe('zId', () => {
  it('trim, vide -> undefined, 64 max', () => {
    expect(ok(zId, ' abc ')).toBe('abc');
    expect(ok(zId, '')).toBeUndefined();
    ok(zId, 'x'.repeat(64));
    ko(zId, 'x'.repeat(65));
  });
});

describe('usage combiné', () => {
  const schema = z.object({
    search: zSearch(),
    status: zCsvEnum(STATUSES),
    from: zDay,
    to: zDay,
    minAmount: zAmount(),
    propertyId: zId
  });
  it('requête vide', () => {
    expect(ok(schema, {})).toEqual({});
  });
  it('requête complète', () => {
    expect(
      ok(schema, {
        search: ' x ',
        status: 'PAID',
        from: '2026-01-01',
        to: '2026-01-31',
        minAmount: '10',
        propertyId: 'p1'
      })
    ).toEqual({ search: 'x', status: ['PAID'], from: '2026-01-01', to: '2026-01-31', minAmount: 10, propertyId: 'p1' });
  });
});
