import {
  buildCashPlan,
  taxEstimateRequests,
  type CashPlanExpenseInput,
  type CashPlanInput
} from '../../src/lib/patrimoine/cash-plan';

/**
 * Plan de trésorerie — corrections de relecture : taxe par couple (bien, échéance),
 * couverture par une dépense périodique, raison NO_FLOW_IN_PERIOD, placement
 * des échéances par période.
 */

const TODAY = new Date('2026-10-15T10:00:00Z');
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const SETTINGS = { propertyTaxDueMonth: 3, propertyTaxDueDay: 31 };

const property = (id: string) => ({ id, title: `Bien ${id}`, status: 'RENTED', transactionModes: ['RENTAL'] });

const expense = (overrides: Partial<CashPlanExpenseInput> = {}): CashPlanExpenseInput => ({
  id: 'exp-1',
  propertyId: 'p1',
  category: 'INSURANCE',
  label: 'Assurance',
  amount: 30_000,
  currency: 'XOF',
  paidAt: d('2026-09-01'),
  recurrence: 'MONTHLY',
  recurrenceEndDate: null,
  ...overrides
});

const plan = (overrides: Partial<CashPlanInput> = {}) =>
  buildCashPlan({
    today: TODAY,
    months: 12,
    openingBalance: null,
    propertyId: null,
    properties: [property('p1')],
    installments: [],
    leases: [],
    loans: [],
    works: [],
    expenses: [],
    settings: { propertyTaxDueMonth: null, propertyTaxDueDay: null },
    taxEstimates: [],
    ...overrides
  });

const estimate = (propertyId: string, year: number, amount: number) => ({
  propertyId,
  year,
  amount,
  allParametersValidated: true
});
const linesOf = (data: ReturnType<typeof plan>, category: string) =>
  data.periods.flatMap(period => period.lines).filter(line => line.category === category);
const sourceOf = (data: ReturnType<typeof plan>, key: string) => data.sources.find(source => source.source === key);

describe('taxe foncière — par couple (bien, échéance)', () => {
  it("un bien dont une seule échéance de la fenêtre n'a pas d'estimation est non estimable (PARTIAL)", () => {
    const data = plan({ months: 24, settings: SETTINGS, taxEstimates: [estimate('p1', 2027, 240_000)] });
    expect(linesOf(data, 'PROPERTY_TAX').map(line => line.month)).toEqual(['2027-03']);
    expect(sourceOf(data, 'PROPERTY_TAX')).toEqual({
      source: 'PROPERTY_TAX',
      status: 'PARTIAL',
      reason: 'TAX_NOT_ESTIMABLE',
      count: 1
    });
  });

  it('toutes les échéances estimées : INCLUDED sans raison', () => {
    const data = plan({
      months: 24,
      settings: SETTINGS,
      taxEstimates: [estimate('p1', 2027, 240_000), estimate('p1', 2028, 250_000)]
    });
    expect(sourceOf(data, 'PROPERTY_TAX')).toEqual({
      source: 'PROPERTY_TAX',
      status: 'INCLUDED',
      reason: null,
      count: null
    });
  });
});

describe('taxe foncière — couverture par une dépense périodique', () => {
  it.each([
    ['terminée avant aujourd’hui', { recurrenceEndDate: d('2026-09-30') }],
    ['en devise étrangère', { currency: 'EUR' }],
    ['de montant nul', { amount: 0 }]
  ])('une dépense PROPERTY_TAX %s ne couvre pas le bien : estimation demandée et ligne produite', (_label, patch) => {
    const taxExpense = expense({ category: 'PROPERTY_TAX', ...patch });
    const data = plan({ expenses: [taxExpense], settings: SETTINGS, taxEstimates: [estimate('p1', 2027, 240_000)] });
    expect(linesOf(data, 'PROPERTY_TAX').map(line => line.amount)).toEqual([240_000]);
    expect(sourceOf(data, 'PROPERTY_TAX')?.reason).toBeNull();
    expect(
      taxEstimateRequests({
        today: TODAY,
        months: 12,
        properties: [property('p1')],
        expenses: [taxExpense],
        settings: SETTINGS
      })
    ).toEqual([{ propertyId: 'p1', year: 2027 }]);
  });

  it('une dépense PROPERTY_TAX qui produit une occurrence couvre le bien : pas de doublon', () => {
    const taxExpense = expense({ category: 'PROPERTY_TAX' });
    const data = plan({ expenses: [taxExpense], settings: SETTINGS, taxEstimates: [estimate('p1', 2027, 240_000)] });
    expect(linesOf(data, 'PROPERTY_TAX')).toEqual([]);
    expect(sourceOf(data, 'PROPERTY_TAX')).toMatchObject({ reason: 'TAX_COVERED_BY_RECURRING_EXPENSE', count: 1 });
  });
});

describe('raisons de source exactes', () => {
  it('NO_FLOW_IN_PERIOD quand des enregistrements existent mais que rien n’entre dans le plan', () => {
    const data = plan({
      leases: [
        {
          id: 'l1',
          tenantId: 't',
          propertyId: 'p1',
          startDate: d('2026-01-01'),
          endDate: null,
          billingFrequency: 'MONTHLY',
          dueDayOfMonth: 5,
          currency: 'EUR',
          rentAmount: 500_000,
          serviceChargeAmount: 0
        }
      ],
      loans: [
        {
          id: 'loan',
          propertyId: 'p1',
          lender: 'B',
          monthlyPayment: 1000,
          currency: 'XOF',
          startDate: d('2025-01-20'),
          endDate: d('2026-09-20'),
          status: 'ACTIVE'
        }
      ],
      works: [
        {
          id: 'w',
          propertyId: 'p1',
          title: 'T',
          estimatedCost: 100_000,
          actualCost: 150_000,
          currency: 'XOF',
          plannedDate: d('2026-12-01'),
          status: 'IN_PROGRESS'
        }
      ],
      expenses: [expense({ recurrenceEndDate: d('2026-09-30') })]
    });
    expect(data.sources.slice(0, 4).map(source => [source.source, source.status, source.reason])).toEqual([
      ['RENT', 'NO_DATA', 'NO_FLOW_IN_PERIOD'],
      ['LOANS', 'NO_DATA', 'NO_FLOW_IN_PERIOD'],
      ['WORKS', 'NO_DATA', 'NO_FLOW_IN_PERIOD'],
      ['RECURRING_EXPENSES', 'NO_DATA', 'NO_FLOW_IN_PERIOD']
    ]);
  });

  it('NO_ACTIVE_* seulement quand il n’y a réellement rien', () => {
    const data = plan({
      loans: [
        {
          id: 'closed',
          propertyId: 'p1',
          lender: 'B',
          monthlyPayment: 1000,
          currency: 'XOF',
          startDate: d('2026-01-20'),
          endDate: d('2028-01-20'),
          status: 'CLOSED'
        }
      ]
    });
    expect(sourceOf(data, 'LOANS')?.reason).toBe('NO_ACTIVE_LOAN');
    expect(sourceOf(data, 'RENT')?.reason).toBe('NO_ACTIVE_LEASE');
  });
});

describe('échéances de loyer — placement par période', () => {
  it("l'échéance est placée au mois de sa période, pas de sa date d'échéance", () => {
    const data = plan({
      installments: [
        {
          id: 'late-due',
          leaseId: 'lease-1',
          propertyId: 'p1',
          periodYear: 2026,
          periodMonth: 12,
          dueDate: d('2026-11-28'),
          status: 'DUE',
          currency: 'XOF',
          amountRent: 100_000,
          amountService: 0,
          amountOtherFees: 0,
          penaltyAmount: 0,
          amountPaid: 0
        }
      ]
    });
    expect(linesOf(data, 'RENT').map(line => line.month)).toEqual(['2026-12']);
  });
});
