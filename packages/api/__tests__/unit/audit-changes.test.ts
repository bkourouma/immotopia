import { Prisma } from '@prisma/client';
import { diffForAudit, normalizeAuditValue } from '../../src/lib/audit/changes';

describe('diffForAudit', () => {
  it('ne renvoie que les champs réellement modifiés', () => {
    const changes = diffForAudit(
      { title: 'Studio', price: 100, city: 'Abidjan' },
      { title: 'Studio meublé', price: 100, city: 'Abidjan' }
    );
    expect(changes).toEqual({ title: { before: 'Studio', after: 'Studio meublé' } });
  });

  it('renvoie undefined quand rien ne change', () => {
    expect(diffForAudit({ a: 1 }, { a: 1 })).toBeUndefined();
    expect(diffForAudit({ a: 1 }, {})).toBeUndefined();
  });

  it('ignore une clé undefined du patch (« ne pas toucher » pour Prisma) mais voit un null', () => {
    expect(diffForAudit({ note: 'x' }, { note: undefined })).toBeUndefined();
    expect(diffForAudit({ note: 'x' }, { note: null })).toEqual({ note: { before: 'x', after: null } });
  });

  it('traite null et absent comme la même valeur vide', () => {
    expect(diffForAudit({}, { note: null })).toBeUndefined();
    expect(diffForAudit({ note: null }, { note: 'x' })).toEqual({ note: { before: null, after: 'x' } });
  });

  it('compare dates et décimaux par valeur, pas par référence', () => {
    expect(
      diffForAudit(
        { startDate: new Date('2026-01-01T00:00:00Z'), rent: new Prisma.Decimal('150000.50') },
        { startDate: new Date('2026-01-01T00:00:00Z'), rent: new Prisma.Decimal('150000.5') }
      )
    ).toBeUndefined();

    expect(diffForAudit({ rent: new Prisma.Decimal('100') }, { rent: new Prisma.Decimal('120') })).toEqual({
      rent: { before: 100, after: 120 }
    });
    expect(diffForAudit({ d: new Date('2026-01-01T00:00:00Z') }, { d: new Date('2026-02-01T00:00:00Z') })).toEqual({
      d: { before: '2026-01-01T00:00:00.000Z', after: '2026-02-01T00:00:00.000Z' }
    });
  });

  it('un décimal et le nombre qui le remplace sont égaux, un autre montant est un changement', () => {
    expect(diffForAudit({ value: new Prisma.Decimal('1000') }, { value: 1000 })).toBeUndefined();
    expect(diffForAudit({ value: new Prisma.Decimal('1000.5') }, { value: 1000.5 })).toBeUndefined();
    expect(diffForAudit({ value: new Prisma.Decimal('1000') }, { value: 1200 })).toEqual({
      value: { before: 1000, after: 1200 }
    });
    // Trop précis pour un nombre : reste du texte, jamais arrondi en silence.
    expect(normalizeAuditValue(new Prisma.Decimal('12345678901234567890.123'))).toBe('12345678901234567890.123');
  });

  it('exclut les champs techniques et ceux qu’on lui demande d’exclure', () => {
    expect(
      diffForAudit(
        { id: 'a', tenantId: 't1', updatedAt: new Date(0), x: 1 },
        { id: 'b', tenantId: 't2', updatedAt: new Date(), x: 2 },
        { exclude: ['x'] }
      )
    ).toBeUndefined();
  });

  it('respecte une liste blanche de champs', () => {
    expect(diffForAudit({ a: 1, b: 1 }, { a: 2, b: 2 }, { fields: ['b'] })).toEqual({ b: { before: 1, after: 2 } });
  });

  it('borne la taille des valeurs et le nombre de champs', () => {
    const long = 'x'.repeat(2000);
    const changes = diffForAudit({ t: 'a' }, { t: long }) as Record<string, { after: string }>;
    expect(changes.t.after.length).toBeLessThan(600);

    const wide = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`f${i}`, i]));
    const before = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`f${i}`, -1]));
    expect(Object.keys(diffForAudit(before, wide) as object)).toHaveLength(50);
  });

  it('compare les objets par leur contenu', () => {
    expect(diffForAudit({ meta: { a: 1 } }, { meta: { a: 1 } })).toBeUndefined();
    expect(diffForAudit({ meta: { a: 1 } }, { meta: { a: 2 } })).toBeDefined();
  });

  it('sans ligne d’origine ou sans patch : undefined', () => {
    expect(diffForAudit(null, { a: 1 })).toBeUndefined();
    expect(diffForAudit({ a: 1 }, null)).toBeUndefined();
  });
});

describe('normalizeAuditValue', () => {
  it('ne plante pas sur une structure cyclique', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(normalizeAuditValue(cyclic)).toBe('[illisible]');
  });
});
