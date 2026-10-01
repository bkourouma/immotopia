import { buildCashPlan, type CashPlanExpenseInput } from '../../src/lib/patrimoine/cash-plan';

/** BUG-2026-10-01-009 : les biens couverts par une charge récurrente de taxe sont comptés à part (FR-012). */

const TODAY = new Date('2026-10-15T10:00:00Z');
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const property = (id: string) => ({ id, title: `Bien ${id}`, status: 'RENTED', transactionModes: ['RENTAL'] });
const taxExpense: CashPlanExpenseInput = {
  id: 'exp-tax',
  propertyId: 'r2',
  category: 'PROPERTY_TAX',
  label: 'Taxe foncière',
  amount: 120_000,
  currency: 'XOF',
  paidAt: d('2026-03-15'),
  recurrence: 'ANNUAL',
  recurrenceEndDate: null
};

const build = (expenses: CashPlanExpenseInput[]) =>
  buildCashPlan({
    today: TODAY,
    months: 24,
    openingBalance: null,
    propertyId: null,
    properties: [property('r1'), property('r2'), property('r3')],
    installments: [],
    leases: [],
    loans: [],
    works: [],
    expenses,
    settings: { propertyTaxDueMonth: 3, propertyTaxDueDay: 15 },
    taxEstimates: []
  });

const tax = (data: ReturnType<typeof build>) => data.sources.find(s => s.source === 'PROPERTY_TAX');

describe('taxe foncière — biens couverts par une charge récurrente', () => {
  it('ne compte pas le bien couvert dans « non estimable » et le déclare à part', () => {
    const source = tax(build([taxExpense]));
    expect(source).toMatchObject({ reason: 'TAX_NOT_ESTIMABLE', count: 2 });
    expect(source?.coveredByRecurringExpenseCount).toBe(1);
  });

  it('sans bien couvert, aucun compteur de couverture', () => {
    expect(tax(build([]))?.coveredByRecurringExpenseCount).toBeUndefined();
  });
});
