/**
 * Lot S2 — analyseur de periodes des appels de charges (`lib/syndics/period.ts`)
 * et son jumeau SQL de la migration de rattrapage.
 */

import { readFileSync } from 'fs';
import * as path from 'path';
import {
  formatIsoDay,
  parseIsoDay,
  parsePeriodBounds,
  recurrenceStepMonths,
  resolvePeriodBounds,
  shiftPeriodBounds
} from '../../src/lib/syndics/period';
import { isoDaySchema, lotPaymentSchema } from '../../src/lib/syndics/charge-allocation-schemas';
import { createChargeCallSchema } from '../../src/lib/syndics/schemas';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const bounds = (label: string) => {
  const parsed = parsePeriodBounds(label);
  return parsed ? [formatIsoDay(parsed.start), formatIsoDay(parsed.end)] : null;
};

describe('parsePeriodBounds', () => {
  it('lit une plage explicite « AAAA-MM-JJ au AAAA-MM-JJ » (format de l ecran des charges)', () => {
    expect(bounds('2026-01-01 au 2026-03-31')).toEqual(['2026-01-01', '2026-03-31']);
    expect(bounds('  2026-02-01 au 2026-02-28  ')).toEqual(['2026-02-01', '2026-02-28']);
  });

  it('refuse une plage inversee ou une date impossible', () => {
    expect(bounds('2026-03-31 au 2026-01-01')).toBeNull();
    expect(bounds('2026-02-30 au 2026-03-31')).toBeNull();
    expect(bounds('2026-01-01 au 2026-13-01')).toBeNull();
  });

  it('lit un mois entier « AAAA-MM », fevrier bissextile compris', () => {
    expect(bounds('2026-01')).toEqual(['2026-01-01', '2026-01-31']);
    expect(bounds('2028-02')).toEqual(['2028-02-01', '2028-02-29']);
    expect(bounds('2026-02')).toEqual(['2026-02-01', '2026-02-28']);
    expect(bounds('2026-13')).toBeNull();
    expect(bounds('2026-00')).toBeNull();
  });

  it('lit un trimestre « AAAA-Qn » ou « AAAA-Tn »', () => {
    expect(bounds('2026-Q1')).toEqual(['2026-01-01', '2026-03-31']);
    expect(bounds('2026-T2')).toEqual(['2026-04-01', '2026-06-30']);
    expect(bounds('2026-q3')).toEqual(['2026-07-01', '2026-09-30']);
    expect(bounds('2026-Q4')).toEqual(['2026-10-01', '2026-12-31']);
    expect(bounds('2026-Q5')).toBeNull();
  });

  it('lit une annee entiere « AAAA »', () => {
    expect(bounds('2026')).toEqual(['2026-01-01', '2026-12-31']);
  });

  it('ignore le suffixe de recurrence « -R1 », pas « -R2 » (decalage inconnu)', () => {
    expect(bounds('2026-01-R1')).toEqual(['2026-01-01', '2026-01-31']);
    expect(bounds('2026-01-01 au 2026-01-31-R1')).toEqual(['2026-01-01', '2026-01-31']);
    expect(bounds('2026-01-R2')).toBeNull();
    expect(bounds('2026-Q1-R12')).toBeNull();
  });

  it('laisse nul un libelle illisible', () => {
    for (const label of ['', 'Janvier 2026', '01/2026', '2026-S1', '0999', 'charges', '2026-1']) {
      expect(bounds(label)).toBeNull();
    }
    expect(parsePeriodBounds(null)).toBeNull();
    expect(parsePeriodBounds(undefined)).toBeNull();
  });
});

describe('parseIsoDay', () => {
  it('refuse une date qu un Date JavaScript repousserait au mois suivant', () => {
    expect(parseIsoDay('2026-02-30')).toBeNull();
    expect(parseIsoDay('2026-04-31')).toBeNull();
    expect(parseIsoDay('2026-02-28')?.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
});

describe('shiftPeriodBounds et recurrence', () => {
  it('garde une fin de mois en fin de mois', () => {
    const january = { start: day('2026-01-01'), end: day('2026-01-31') };
    const shifted = shiftPeriodBounds(january, 1);
    expect([formatIsoDay(shifted.start), formatIsoDay(shifted.end)]).toEqual(['2026-02-01', '2026-02-28']);
    const march = shiftPeriodBounds(january, 2);
    expect(formatIsoDay(march.end)).toBe('2026-03-31');
  });

  it('decale un trimestre de trois mois et passe l annee', () => {
    const q4 = { start: day('2026-10-01'), end: day('2026-12-31') };
    const next = shiftPeriodBounds(q4, recurrenceStepMonths('QUARTERLY'));
    expect([formatIsoDay(next.start), formatIsoDay(next.end)]).toEqual(['2027-01-01', '2027-03-31']);
  });

  it('borne un jour au dernier jour du mois cible quand il n existe pas', () => {
    const odd = { start: day('2026-01-31'), end: day('2026-02-15') };
    const shifted = shiftPeriodBounds(odd, 1);
    expect([formatIsoDay(shifted.start), formatIsoDay(shifted.end)]).toEqual(['2026-02-28', '2026-03-15']);
  });

  it('pas de recurrence : 1, 3 ou 12 mois', () => {
    expect(recurrenceStepMonths('MONTHLY')).toBe(1);
    expect(recurrenceStepMonths('QUARTERLY')).toBe(3);
    expect(recurrenceStepMonths('ANNUAL')).toBe(12);
  });

  it('prefere les bornes fournies au libelle', () => {
    const explicit = resolvePeriodBounds({ period: '2026-Q1', periodStart: day('2026-01-15'), periodEnd: day('2026-02-15') });
    expect(formatIsoDay(explicit!.start)).toBe('2026-01-15');
    expect(formatIsoDay(resolvePeriodBounds({ period: '2026-Q1' })!.end)).toBe('2026-03-31');
    expect(resolvePeriodBounds({ period: 'libre' })).toBeNull();
  });
});

describe('schemas zod des bornes', () => {
  it('isoDaySchema accepte AAAA-MM-JJ et une date-heure ISO, refuse une date impossible', () => {
    expect(isoDaySchema.parse('2026-03-31').toISOString()).toBe('2026-03-31T00:00:00.000Z');
    expect(isoDaySchema.parse('2026-03-31T10:00:00.000Z').toISOString()).toBe('2026-03-31T00:00:00.000Z');
    expect(() => isoDaySchema.parse('2026-02-30')).toThrow();
    expect(() => isoDaySchema.parse('31/03/2026')).toThrow();
  });

  const baseCall = {
    syndicateId: '11111111-1111-4111-8111-111111111111',
    lotId: '22222222-2222-4222-8222-222222222222',
    period: 'Charges T1',
    amount: 1000,
    dueDate: '2026-01-10'
  };

  it('createChargeCallSchema accepte des bornes facultatives, ensemble et ordonnees', () => {
    const parsed = createChargeCallSchema.parse({ ...baseCall, periodStart: '2026-01-01', periodEnd: '2026-03-31' });
    expect(parsed.periodStart?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(createChargeCallSchema.parse(baseCall).periodStart).toBeUndefined();
    expect(() => createChargeCallSchema.parse({ ...baseCall, periodStart: '2026-01-01' })).toThrow();
    expect(() =>
      createChargeCallSchema.parse({ ...baseCall, periodStart: '2026-04-01', periodEnd: '2026-03-31' })
    ).toThrow();
  });

  it('lotPaymentSchema exige un montant positif et un moyen de paiement, refuse un champ inconnu', () => {
    const ok = lotPaymentSchema.parse({ amount: 1000, paidAt: '2026-01-05', method: 'VIREMENT' });
    expect(ok.amount).toBe(1000);
    expect(() => lotPaymentSchema.parse({ amount: 0, paidAt: '2026-01-05', method: 'VIREMENT' })).toThrow();
    expect(() => lotPaymentSchema.parse({ amount: 10, paidAt: '2026-01-05' })).toThrow();
    expect(() =>
      lotPaymentSchema.parse({ amount: 10, paidAt: '2026-01-05', method: 'X', chargeCallIds: ['pas-un-uuid'] })
    ).toThrow();
    expect(() => lotPaymentSchema.parse({ amount: 10, paidAt: '2026-01-05', method: 'X', lotId: 'x' })).toThrow();
  });
});

describe('parite avec la fonction SQL de rattrapage', () => {
  // La migration n'est pas executable ici (aucune base) : on verifie au moins
  // que ses motifs reconnaissent les memes formats que l'analyseur TypeScript.
  const sql = readFileSync(
    path.join(__dirname, '../../prisma/migrations/20260929110000_syndic_affectation_avance/migration.sql'),
    'utf8'
  );

  it('porte les quatre motifs de format et le suffixe -R1', () => {
    expect(sql).toContain(String.raw`base ~ '^[1-9]\d{3}-\d{2}-\d{2} au [1-9]\d{3}-\d{2}-\d{2}$'`);
    expect(sql).toContain(String.raw`base ~ '^[1-9]\d{3}-\d{2}$'`);
    expect(sql).toContain(String.raw`base ~ '^[1-9]\d{3}-[QqTt][1-4]$'`);
    expect(sql).toContain(String.raw`base ~ '^[1-9]\d{3}$'`);
    expect(sql).toContain(`'-R1$'`);
  });

  it('les motifs SQL, rejoues en JavaScript, classent les libelles comme l analyseur', () => {
    const patterns = [
      /^[1-9]\d{3}-\d{2}-\d{2} au [1-9]\d{3}-\d{2}-\d{2}$/,
      /^[1-9]\d{3}-\d{2}$/,
      /^[1-9]\d{3}-[QqTt][1-4]$/,
      /^[1-9]\d{3}$/
    ];
    const samples = ['2026-01-01 au 2026-03-31', '2026-01', '2026-Q1', '2026-T4', '2026', '2026-01-R1', 'libre', '2026-S1'];
    for (const label of samples) {
      const base = label.trim().replace(/-R1$/, '');
      const sqlRecognizes = patterns.some(pattern => pattern.test(base));
      expect([label, sqlRecognizes]).toEqual([label, parsePeriodBounds(label) !== null]);
    }
  });
});
