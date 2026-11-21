import { RentalBillingFrequency } from '@prisma/client';
import {
  buildInstallmentForPeriod,
  resolveAmountsForPeriod,
  type RentChange
} from '../../src/lib/finance/installment-builder';

const lease = (start: string, dueDay: number, rent = 150000) =>
  ({
    id: 'l1',
    tenant_id: 't1',
    start_date: new Date(`${start}T00:00:00`),
    end_date: null,
    billing_frequency: RentalBillingFrequency.MONTHLY,
    due_day_of_month: dueDay,
    currency: 'FCFA',
    rent_amount: rent,
    service_charge_amount: 0
  }) as any;

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('buildInstallmentForPeriod - première échéance (BUG-023)', () => {
  it("n'est jamais antérieure au début du bail : report au mois suivant", () => {
    const built = buildInstallmentForPeriod(lease('2026-09-28', 5), 2026, 9);
    expect(built.included).toBe(true);
    if (built.included) {
      expect(built.data.period_month).toBe(9);
      expect(ymd(built.data.due_date)).toBe('2026-10-05');
    }
  });

  it("garde le jour d'échéance du mois de début quand il n'est pas passé", () => {
    const built = buildInstallmentForPeriod(lease('2026-09-01', 5), 2026, 9);
    if (built.included) expect(ymd(built.data.due_date)).toBe('2026-09-05');
    const later = buildInstallmentForPeriod(lease('2026-09-03', 5), 2026, 9);
    if (later.included) expect(ymd(later.data.due_date)).toBe('2026-09-05');
  });

  it('ne touche pas les échéances suivantes', () => {
    const built = buildInstallmentForPeriod(lease('2026-09-28', 5), 2026, 10);
    if (built.included) expect(ymd(built.data.due_date)).toBe('2026-10-05');
  });
});

describe('resolveAmountsForPeriod - révision (BUG-023)', () => {
  const change: RentChange = {
    effectiveYear: 2026,
    effectiveMonth: 10,
    previousRent: 150000,
    newRent: 160000,
    previousCharges: 0,
    newCharges: 0
  };

  it("garde le loyer d'avant avant le mois d'effet", () => {
    expect(Number(resolveAmountsForPeriod(lease('2026-09-28', 5, 160000), 2026, 9, [change]).rent)).toBe(150000);
  });

  it("applique le nouveau loyer à partir du mois d'effet", () => {
    expect(Number(resolveAmountsForPeriod(lease('2026-09-28', 5, 160000), 2026, 10, [change]).rent)).toBe(160000);
    expect(Number(resolveAmountsForPeriod(lease('2026-09-28', 5, 160000), 2027, 3, [change]).rent)).toBe(160000);
  });

  it('sans révision, loyer du bail', () => {
    expect(Number(resolveAmountsForPeriod(lease('2026-09-28', 5, 150000), 2026, 9, []).rent)).toBe(150000);
  });

  it('passe par le constructeur', () => {
    // Loyer d'avant la révision, au prorata de la première période (28/09 : 3 jours sur 30).
    const built = buildInstallmentForPeriod(lease('2026-09-28', 5, 160000), 2026, 9, [change]);
    expect(built.included).toBe(true);
    if (built.included) expect(Number(built.data.amount_rent)).toBe(15000);
    const full = buildInstallmentForPeriod(lease('2026-09-01', 5, 160000), 2026, 9, [change]);
    if (full.included) expect(Number(full.data.amount_rent)).toBe(150000);
  });
});

// ---------------------------------------------------------------------------
// Prorata au jour (décision H5)
// ---------------------------------------------------------------------------

const full = (
  start: string,
  end: string | null,
  opts: { freq?: RentalBillingFrequency; rent?: number; charges?: number; currency?: string } = {}
) =>
  ({
    id: 'l1',
    tenant_id: 't1',
    start_date: new Date(`${start}T00:00:00`),
    end_date: end ? new Date(`${end}T00:00:00`) : null,
    billing_frequency: opts.freq ?? RentalBillingFrequency.MONTHLY,
    due_day_of_month: 5,
    currency: opts.currency ?? 'FCFA',
    rent_amount: opts.rent ?? 100000,
    service_charge_amount: opts.charges ?? 0
  }) as any;

function amounts(l: any, y: number, m: number, options?: { periodEnd?: Date }) {
  const built = buildInstallmentForPeriod(l, y, m, undefined, options);
  if (!built.included) throw new Error(`période exclue : ${built.reason}`);
  return { rent: Number(built.data.amount_rent), service: Number(built.data.amount_service) };
}

describe('prorata au jour - première période', () => {
  it('bail mensuel démarrant le 15/07/2026 : 17/31 du loyer et des charges', () => {
    const l = full('2026-07-15', null, { rent: 155000, charges: 31000 });
    expect(amounts(l, 2026, 7)).toEqual({ rent: 85000, service: 17000 });
  });

  it('bail démarrant le 1er du mois : montant plein (inchangé)', () => {
    const l = full('2026-07-01', '2027-06-30', { rent: 155000, charges: 31000 });
    expect(amounts(l, 2026, 7)).toEqual({ rent: 155000, service: 31000 });
    expect(amounts(l, 2027, 6)).toEqual({ rent: 155000, service: 31000 });
  });

  it('bail sans date de fin à mi-mois : le mois suivant est plein (campagne mois par mois)', () => {
    const l = full('2026-07-15', null);
    expect(amounts(l, 2026, 8).rent).toBe(100000);
    expect(amounts(l, 2027, 8).rent).toBe(100000);
  });

  it('trimestriel démarrant mi-trimestre : jours couverts / jours du trimestre civil', () => {
    // Début 15/08/2026, cycle de 3 mois : août-octobre = 92 jours, 78 couverts.
    const l = full('2026-08-15', null, { freq: RentalBillingFrequency.QUARTERLY, rent: 92000 });
    expect(amounts(l, 2026, 8).rent).toBe(78000);
    // Période suivante (novembre-janvier) : pleine.
    expect(amounts(l, 2026, 11).rent).toBe(92000);
  });

  it('février bissextile : 29 jours', () => {
    // Début 15/02/2028 : 15 jours couverts sur 29.
    expect(amounts(full('2028-02-15', null, { rent: 290000 }), 2028, 2).rent).toBe(150000);
    // Février non bissextile : 14 jours sur 28.
    expect(amounts(full('2027-02-15', null, { rent: 280000 }), 2027, 2).rent).toBe(140000);
  });

  it('bail commençant le dernier jour du mois : 1 jour facturé', () => {
    expect(amounts(full('2026-07-31', null, { rent: 31000 }), 2026, 7).rent).toBe(1000);
  });
});

describe('prorata au jour - dernière période', () => {
  it('bail 15/07/2026 -> 14/07/2027 : 13 échéances, extrémités = un mois', () => {
    const l = full('2026-07-15', '2027-07-14', { rent: 155000, charges: 31000 });
    const first = amounts(l, 2026, 7);
    const last = amounts(l, 2027, 7);
    expect(first).toEqual({ rent: 85000, service: 17000 });
    expect(last).toEqual({ rent: 70000, service: 14000 });
    expect(first.rent + last.rent).toBe(155000);
    expect(first.service + last.service).toBe(31000);
    for (const [y, m] of [
      [2026, 8],
      [2027, 6]
    ]) {
      expect(amounts(l, y, m)).toEqual({ rent: 155000, service: 31000 });
    }
  });

  it('fin de bail le dernier jour du mois : dernière période pleine', () => {
    const l = full('2026-07-01', '2027-06-30');
    expect(amounts(l, 2027, 6).rent).toBe(100000);
  });

  it('une période réduite au seul dernier jour du bail reste non facturée', () => {
    const l = full('2026-07-01', '2027-07-01');
    expect(buildInstallmentForPeriod(l, 2027, 7)).toEqual({ included: false, reason: 'PERIOD_AFTER_LEASE_END' });
    expect(amounts(l, 2027, 6).rent).toBe(100000);
  });

  it('fin effective transmise (horizon d’un an d’un bail sans fin) : 14/31', () => {
    const l = full('2026-07-15', null, { rent: 155000 });
    expect(amounts(l, 2027, 7, { periodEnd: new Date(2027, 6, 14) }).rent).toBe(70000);
  });

  it('trimestriel : dernière période écourtée', () => {
    // Fin le 14/05/2027, trimestres démarrés en février : mai-juillet (92 j), 14 couverts.
    const l = full('2026-11-01', '2027-05-14', { freq: RentalBillingFrequency.QUARTERLY, rent: 92000 });
    expect(amounts(l, 2027, 5).rent).toBe(14000);
    expect(amounts(l, 2027, 2).rent).toBe(92000);
  });
});

describe('prorata au jour - arrondi par devise', () => {
  it('FCFA : toujours entier, aucune décimale', () => {
    for (const day of ['02', '09', '13', '17', '22', '28']) {
      const l = full(`2026-09-${day}`, null, { rent: 150001, charges: 12345 });
      const { rent, service } = amounts(l, 2026, 9);
      expect(Number.isInteger(rent)).toBe(true);
      expect(Number.isInteger(service)).toBe(true);
    }
  });

  it('EUR : deux décimales', () => {
    const l = full('2026-09-10', null, { rent: 1000, charges: 50, currency: 'EUR' });
    const { rent, service } = amounts(l, 2026, 9);
    // 21 jours sur 30.
    expect(rent).toBe(700);
    expect(service).toBe(35);
    const odd = amounts(full('2026-07-15', null, { rent: 1000, currency: 'EUR' }), 2026, 7);
    expect(odd.rent).toBe(548.39);
  });
});
