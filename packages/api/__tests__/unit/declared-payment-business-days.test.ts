import { addBusinessDays, businessDaysBetween, isOverdue } from '../../src/lib/syndics/declared-payment/business-days';

// 2026-10-12 est un lundi.
const d = (iso: string) => new Date(`${iso}T09:30:00Z`);
const day = (date: Date) => date.toISOString().slice(0, 10);

describe('addBusinessDays', () => {
  it('n = 0 renvoie la même date (copie)', () => {
    const base = d('2026-10-17'); // samedi
    const result = addBusinessDays(base, 0);
    expect(result.getTime()).toBe(base.getTime());
    expect(result).not.toBe(base);
  });

  it('avance dans la semaine', () => {
    expect(day(addBusinessDays(d('2026-10-12'), 3))).toBe('2026-10-15');
  });

  it('saute le week-end', () => {
    expect(day(addBusinessDays(d('2026-10-16'), 1))).toBe('2026-10-19'); // vendredi -> lundi
    expect(day(addBusinessDays(d('2026-10-17'), 1))).toBe('2026-10-19'); // samedi -> lundi
    expect(day(addBusinessDays(d('2026-10-12'), 5))).toBe('2026-10-19');
  });

  it("conserve l'heure", () => {
    expect(addBusinessDays(d('2026-10-16'), 1).toISOString()).toBe('2026-10-19T09:30:00.000Z');
  });
});

describe('businessDaysBetween', () => {
  it('compte les jours ouvrés de la semaine', () => {
    expect(businessDaysBetween(d('2026-10-12'), d('2026-10-15'))).toBe(3);
  });

  it('vendredi vers lundi vaut 1', () => {
    expect(businessDaysBetween(d('2026-10-16'), d('2026-10-19'))).toBe(1);
  });

  it("d'un week-end à l'autre", () => {
    expect(businessDaysBetween(d('2026-10-17'), d('2026-10-18'))).toBe(0);
    expect(businessDaysBetween(d('2026-10-17'), d('2026-10-19'))).toBe(1);
  });

  it('lundi vers lundi suivant vaut 5', () => {
    expect(businessDaysBetween(d('2026-10-12'), d('2026-10-19'))).toBe(5);
  });

  it("zéro quand to n'est pas après from", () => {
    expect(businessDaysBetween(d('2026-10-15'), d('2026-10-15'))).toBe(0);
    expect(businessDaysBetween(d('2026-10-15'), d('2026-10-12'))).toBe(0);
  });
});

describe('isOverdue', () => {
  it('vrai quand n jours ouvrés sont écoulés', () => {
    expect(isOverdue(d('2026-10-12'), 3, d('2026-10-15'))).toBe(true);
    expect(isOverdue(d('2026-10-12'), 3, d('2026-10-14'))).toBe(false);
  });

  it('le week-end ne compte pas', () => {
    expect(isOverdue(d('2026-10-16'), 2, d('2026-10-18'))).toBe(false);
    expect(isOverdue(d('2026-10-16'), 2, d('2026-10-20'))).toBe(true);
  });

  it('n = 0 est toujours en retard', () => {
    expect(isOverdue(d('2026-10-15'), 0, d('2026-10-15'))).toBe(true);
  });
});
