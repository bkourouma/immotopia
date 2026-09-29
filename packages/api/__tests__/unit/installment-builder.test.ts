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
    const built = buildInstallmentForPeriod(lease('2026-09-28', 5, 160000), 2026, 9, [change]);
    if (built.included) expect(Number(built.data.amount_rent)).toBe(150000);
  });
});
