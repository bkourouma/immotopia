/**
 * Fin de mois dans les periodes de facturation (lib/subscription/pricing.ts) :
 * une periode commencant un 31 finit le dernier jour du mois suivant, puis le
 * jour d'ancrage est retrouve. Pur : aucune base.
 */

import {
  BILLING_ANCHOR_METADATA_KEY,
  addBillingPeriod,
  replaceBillingAnchorDay,
  resolveBillingAnchorDay,
  withBillingAnchorDay
} from '../../src/lib/subscription/pricing';

const iso = (date: Date) => date.toISOString();
const d = (s: string) => new Date(s);

describe('addBillingPeriod : fin de mois', () => {
  it('31 janvier -> 28 fevrier -> (ancre 31) 31 mars -> 30 avril', () => {
    const feb = addBillingPeriod(d('2027-01-31T00:00:00Z'), 'MONTHLY', 31);
    expect(iso(feb)).toBe('2027-02-28T00:00:00.000Z');
    const mar = addBillingPeriod(feb, 'MONTHLY', 31);
    expect(iso(mar)).toBe('2027-03-31T00:00:00.000Z');
    expect(iso(addBillingPeriod(mar, 'MONTHLY', 31))).toBe('2027-04-30T00:00:00.000Z');
  });

  it('annee bissextile : 31 janvier -> 29 fevrier -> 31 mars', () => {
    const feb = addBillingPeriod(d('2028-01-31T00:00:00Z'), 'MONTHLY');
    expect(iso(feb)).toBe('2028-02-29T00:00:00.000Z');
    expect(iso(addBillingPeriod(feb, 'MONTHLY', 31))).toBe('2028-03-31T00:00:00.000Z');
  });

  it('31 aout -> 30 septembre', () => {
    expect(iso(addBillingPeriod(d('2027-08-31T00:00:00Z'), 'MONTHLY'))).toBe('2027-09-30T00:00:00.000Z');
  });

  it('sans ancre : 31 janvier -> 28 fevrier (jamais 3 mars)', () => {
    expect(iso(addBillingPeriod(d('2027-01-31T00:00:00Z'), 'MONTHLY'))).toBe('2027-02-28T00:00:00.000Z');
  });

  it('annuel : 29 fevrier 2028 -> 28 fevrier 2029 -> 28 fevrier 2030 sans ancre', () => {
    const y1 = addBillingPeriod(d('2028-02-29T00:00:00Z'), 'ANNUAL');
    expect(iso(y1)).toBe('2029-02-28T00:00:00.000Z');
    expect(iso(addBillingPeriod(y1, 'ANNUAL'))).toBe('2030-02-28T00:00:00.000Z');
  });

  it('annuel avec ancre 29 : 28 fevrier 2031 -> 29 fevrier 2032', () => {
    expect(iso(addBillingPeriod(d('2031-02-28T00:00:00Z'), 'ANNUAL', 29))).toBe('2032-02-29T00:00:00.000Z');
  });

  it('jours 1 a 28 : identique a l’ancien calcul setUTCMonth(+1 / +12), avec ou sans ancre (milliers de cas)', () => {
    // Reference : l'implementation d'avant la regle de fin de mois, recopiee telle quelle.
    const legacy = (start: Date, cycle: 'MONTHLY' | 'ANNUAL') => {
      const end = new Date(start.getTime());
      end.setUTCMonth(end.getUTCMonth() + (cycle === 'ANNUAL' ? 12 : 1));
      return end;
    };
    const times: Array<[number, number, number, number]> = [
      [0, 0, 0, 1],
      [9, 41, 7, 250],
      [23, 59, 59, 999]
    ];
    let checked = 0;
    // 2024 et 2028 bissextiles ; decembre -> janvier couvre le passage d'annee.
    for (let year = 2024; year <= 2031; year++) {
      for (let month = 0; month < 12; month++) {
        for (let day = 1; day <= 28; day++) {
          for (const [h, mi, s, ms] of times) {
            const start = new Date(Date.UTC(year, month, day, h, mi, s, ms));
            for (const cycle of ['MONTHLY', 'ANNUAL'] as const) {
              const expected = legacy(start, cycle).getTime();
              if (addBillingPeriod(start, cycle).getTime() !== expected) {
                throw new Error(`ecart sans ancre : ${start.toISOString()} ${cycle}`);
              }
              if (addBillingPeriod(start, cycle, day).getTime() !== expected) {
                throw new Error(`ecart avec ancre ${day} : ${start.toISOString()} ${cycle}`);
              }
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBe(8 * 12 * 28 * times.length * 2);
  });

  it('jours d’ancrage <= 28 inchanges sur 12 mois', () => {
    for (const day of [15, 28]) {
      let cur = new Date(Date.UTC(2027, 0, day));
      for (let i = 1; i <= 12; i++) {
        cur = addBillingPeriod(cur, 'MONTHLY', day);
        expect(cur.getUTCDate()).toBe(day);
        expect(cur.getUTCMonth()).toBe(i % 12);
      }
      expect(cur.getUTCFullYear()).toBe(2028);
    }
  });

  it('conserve l’heure', () => {
    expect(iso(addBillingPeriod(d('2027-01-31T13:45:12.345Z'), 'MONTHLY'))).toBe('2027-02-28T13:45:12.345Z');
  });

  it('passage d’annee : decembre -> janvier', () => {
    expect(iso(addBillingPeriod(d('2027-12-31T00:00:00Z'), 'MONTHLY'))).toBe('2028-01-31T00:00:00.000Z');
  });

  it('14 renouvellements mensuels depuis le 31 janvier 2027 retombent sur le 31 les mois de 31 jours', () => {
    // fevrier 2027 ... mars 2028
    const expectedDays = [28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 29, 31];
    let cur = d('2027-01-31T00:00:00Z');
    let metadata: unknown = null;
    const seen: number[] = [];
    for (let i = 0; i < 14; i++) {
      const anchor = resolveBillingAnchorDay(metadata, cur);
      const next = addBillingPeriod(cur, 'MONTHLY', anchor);
      metadata = withBillingAnchorDay(metadata, anchor) ?? metadata;
      seen.push(next.getUTCDate());
      expect(next.getUTCMonth()).toBe((cur.getUTCMonth() + 1) % 12);
      cur = next;
    }
    expect(seen).toEqual(expectedDays);
    expect((metadata as Record<string, unknown>)[BILLING_ANCHOR_METADATA_KEY]).toBe(31);
  });
});

describe('resolveBillingAnchorDay / withBillingAnchorDay', () => {
  const start = d('2027-02-28T00:00:00Z');

  it('resolve : valeur stockee valide, sinon jour UTC du debut', () => {
    expect(resolveBillingAnchorDay({ billingAnchorDay: 31 }, start)).toBe(31);
    expect(resolveBillingAnchorDay(null, start)).toBe(28);
    expect(resolveBillingAnchorDay(undefined, start)).toBe(28);
    expect(resolveBillingAnchorDay({ billingAnchorDay: 0 }, start)).toBe(28);
    expect(resolveBillingAnchorDay({ billingAnchorDay: 32 }, start)).toBe(28);
    expect(resolveBillingAnchorDay({ billingAnchorDay: 30.5 }, start)).toBe(28);
    expect(resolveBillingAnchorDay({ billingAnchorDay: '31' }, start)).toBe(28);
    expect(resolveBillingAnchorDay('texte', start)).toBe(28);
    expect(resolveBillingAnchorDay([31], start)).toBe(28);
  });

  it('with : ecrit seulement pour une ancre > 28 non deja stockee, en conservant le reste', () => {
    expect(withBillingAnchorDay(null, 31)).toEqual({ billingAnchorDay: 31 });
    expect(withBillingAnchorDay({ note: 'x' }, 30)).toEqual({ note: 'x', billingAnchorDay: 30 });
    expect(withBillingAnchorDay({ billingAnchorDay: 29 }, 31)).toEqual({ billingAnchorDay: 31 });
  });

  it('with : undefined si deja stocke, <= 28 ou invalide', () => {
    expect(withBillingAnchorDay({ billingAnchorDay: 31 }, 31)).toBeUndefined();
    expect(withBillingAnchorDay(null, 28)).toBeUndefined();
    expect(withBillingAnchorDay(null, 15)).toBeUndefined();
    expect(withBillingAnchorDay(null, 32)).toBeUndefined();
  });

  it('with : ne modifie pas l’objet recu', () => {
    const meta = { note: 'x' };
    withBillingAnchorDay(meta, 31);
    expect(meta).toEqual({ note: 'x' });
  });
});

describe('replaceBillingAnchorDay (periode qui repart d’une nouvelle date)', () => {
  it('jour > 28 : pose ou remplace la cle, conserve les autres', () => {
    expect(replaceBillingAnchorDay(null, 31)).toEqual({ billingAnchorDay: 31 });
    expect(replaceBillingAnchorDay({ note: 'x', billingAnchorDay: 31 }, 30)).toEqual({
      note: 'x',
      billingAnchorDay: 30
    });
  });

  it('jour <= 28 : supprime une ancre perimee, conserve les autres cles', () => {
    expect(replaceBillingAnchorDay({ note: 'x', billingAnchorDay: 31 }, 10)).toEqual({ note: 'x' });
    expect(replaceBillingAnchorDay({ billingAnchorDay: 29 }, 28)).toEqual({});
  });

  it('undefined quand rien ne change', () => {
    expect(replaceBillingAnchorDay({ billingAnchorDay: 31 }, 31)).toBeUndefined();
    expect(replaceBillingAnchorDay({ note: 'x' }, 10)).toBeUndefined();
    expect(replaceBillingAnchorDay(null, 10)).toBeUndefined();
    expect(replaceBillingAnchorDay('texte', 10)).toBeUndefined();
  });

  it('ne modifie pas l’objet recu', () => {
    const meta = { note: 'x', billingAnchorDay: 31 };
    replaceBillingAnchorDay(meta, 10);
    replaceBillingAnchorDay(meta, 30);
    expect(meta).toEqual({ note: 'x', billingAnchorDay: 31 });
  });

  it('periode qui repart le 10/03 avec une ancre perimee 31 : 10/04 puis 10/05 (et non 31/05)', () => {
    const now = d('2027-03-10T09:00:00Z');
    const metadata = replaceBillingAnchorDay({ billingAnchorDay: 31 }, now.getUTCDate());
    const end = addBillingPeriod(now, 'MONTHLY');
    expect(iso(end)).toBe('2027-04-10T09:00:00.000Z');
    expect(iso(addBillingPeriod(end, 'MONTHLY', resolveBillingAnchorDay(metadata, end)))).toBe(
      '2027-05-10T09:00:00.000Z'
    );
  });
});
