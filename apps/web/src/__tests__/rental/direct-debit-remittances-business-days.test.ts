import { describe, it, expect } from 'vitest';
import {
  firstPossibleCollectionDate,
  isBusinessDay,
  isCollectionDateAllowed,
  parseIsoDay,
  prenotificationDeadline,
  subtractBusinessDays,
  toIsoDay
} from '../../components/rental/direct-debit/business-days';

/**
 * Spec 042, P2 (§7.2) — jours ouvrés lundi-vendredi, date de collecte
 * acceptable. Repère : le 16/10/2026 est un vendredi.
 */

const day = (iso: string) => parseIsoDay(iso) as Date;
const iso = (date: Date | null) => (date ? toIsoDay(date) : null);

describe('jours ouvrés', () => {
  it('reconnaît le week-end', () => {
    expect(isBusinessDay(day('2026-10-16'))).toBe(true); // vendredi
    expect(isBusinessDay(day('2026-10-17'))).toBe(false); // samedi
    expect(isBusinessDay(day('2026-10-18'))).toBe(false); // dimanche
    expect(isBusinessDay(day('2026-10-19'))).toBe(true); // lundi
  });

  it('0 jour ouvré rend la date elle-même, même un week-end', () => {
    expect(iso(subtractBusinessDays(day('2026-10-17'), 0))).toBe('2026-10-17');
    expect(iso(prenotificationDeadline(day('2026-10-19'), 0))).toBe('2026-10-19');
  });

  it('saute le week-end en reculant', () => {
    expect(iso(subtractBusinessDays(day('2026-10-19'), 1))).toBe('2026-10-16'); // lundi -> vendredi
    expect(iso(subtractBusinessDays(day('2026-10-19'), 5))).toBe('2026-10-12');
    expect(iso(subtractBusinessDays(day('2026-10-17'), 1))).toBe('2026-10-16'); // samedi -> vendredi
  });
});

describe('date de collecte acceptable', () => {
  const today = day('2026-10-16');

  it('exige une date strictement postérieure à aujourd’hui', () => {
    expect(isCollectionDateAllowed(day('2026-10-16'), today, 0)).toBe(false);
    expect(isCollectionDateAllowed(day('2026-10-17'), today, 0)).toBe(true);
  });

  it('exige que la date limite de prénotification ne soit pas passée', () => {
    // 5 jours ouvrés avant le 23/10 = 16/10 : aujourd’hui, encore possible.
    expect(isCollectionDateAllowed(day('2026-10-23'), today, 5)).toBe(true);
    // 5 jours ouvrés avant le 22/10 = 15/10 : passée.
    expect(isCollectionDateAllowed(day('2026-10-22'), today, 5)).toBe(false);
  });
});

describe('première date proposée', () => {
  const today = day('2026-10-16');

  it('prend le jour de collecte du mois courant s’il est encore possible', () => {
    expect(iso(firstPossibleCollectionDate(23, 5, today))).toBe('2026-10-23');
  });

  it('passe au mois suivant quand le délai de prénotification est dépassé', () => {
    expect(iso(firstPossibleCollectionDate(5, 5, today))).toBe('2026-11-05');
    expect(iso(firstPossibleCollectionDate(20, 5, today))).toBe('2026-11-20');
  });

  it('ramène un jour 31 au dernier jour d’un mois plus court', () => {
    expect(iso(firstPossibleCollectionDate(31, 0, day('2026-11-02')))).toBe('2026-11-30');
  });

  it('rend null pour un jour de collecte invalide', () => {
    expect(firstPossibleCollectionDate(0, 5, today)).toBeNull();
    expect(firstPossibleCollectionDate(32, 5, today)).toBeNull();
  });
});
