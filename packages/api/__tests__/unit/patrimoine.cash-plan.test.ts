import {
  buildCashPlan,
  classifyProperties,
  listTaxDueDates,
  taxEstimateRequests,
  type CashPlanExpenseInput,
  type CashPlanInput,
  type CashPlanLeaseInput,
  type CashPlanLoanInput,
  type CashPlanPropertyInput,
  type CashPlanWorkInput
} from '../../src/lib/patrimoine/cash-plan';

/**
 * Plan de trésorerie prévisionnel (spec 030) — calcul pur.
 * « Aujourd'hui » est fixé au 15 octobre 2026 : le mois 1 est 2026-10, le plan
 * de 12 mois s'arrête en 2027-09.
 */

const TODAY = new Date('2026-10-15T10:00:00Z');
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

const property = (id: string, overrides: Partial<CashPlanPropertyInput> = {}): CashPlanPropertyInput => ({
  id,
  title: `Bien ${id}`,
  status: 'RENTED',
  transactionModes: ['RENTAL'],
  ...overrides
});

const lease = (overrides: Partial<CashPlanLeaseInput> = {}): CashPlanLeaseInput => ({
  id: 'lease-1',
  tenantId: 'tenant-1',
  propertyId: 'p1',
  startDate: d('2026-01-01'),
  endDate: null,
  billingFrequency: 'MONTHLY',
  dueDayOfMonth: 5,
  currency: 'FCFA',
  rentAmount: 500_000,
  serviceChargeAmount: 50_000,
  ...overrides
});

const loan = (overrides: Partial<CashPlanLoanInput> = {}): CashPlanLoanInput => ({
  id: 'loan-1',
  propertyId: 'p1',
  lender: 'Banque X',
  monthlyPayment: 100_000,
  currency: 'XOF',
  startDate: d('2025-12-20'),
  endDate: d('2027-12-20'),
  status: 'ACTIVE',
  ...overrides
});

const work = (overrides: Partial<CashPlanWorkInput> = {}): CashPlanWorkInput => ({
  id: 'work-1',
  propertyId: 'p1',
  title: 'Toiture',
  estimatedCost: 1_200_000,
  actualCost: null,
  currency: 'XOF',
  plannedDate: d('2027-01-10'),
  status: 'PLANNED',
  ...overrides
});

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

const linesOf = (data: ReturnType<typeof plan>, category?: string) =>
  data.periods.flatMap(period => period.lines).filter(line => !category || line.category === category);

const sourceOf = (data: ReturnType<typeof plan>, key: string) => data.sources.find(source => source.source === key);

describe('plan de trésorerie — cas nominal', () => {
  const data = plan({
    openingBalance: 1_000_000,
    leases: [lease()],
    loans: [loan()],
    works: [work()],
    expenses: [expense()]
  });

  it('couvre exactement 12 mois à partir du mois courant (UTC)', () => {
    expect(data.currency).toBe('XOF');
    expect(data.startMonth).toBe('2026-10');
    expect(data.months).toBe(12);
    expect(data.periods).toHaveLength(12);
    expect(data.periods[0].month).toBe('2026-10');
    expect(data.periods[11].month).toBe('2027-09');
    expect(data.generatedAt).toBe(TODAY.toISOString());
  });

  it('calcule entrées, sorties, net et cumul du premier mois', () => {
    // Loyer + charges 550 000 ; mensualité du 20 octobre 100 000 ; l'assurance
    // du 1er octobre est déjà passée (avant aujourd'hui).
    const first = data.periods[0];
    expect(first.inflows).toBe(550_000);
    expect(first.outflows).toBe(100_000);
    expect(first.net).toBe(450_000);
    expect(first.cumulative).toBe(1_450_000);
    expect(first.byCategory.RECURRING_EXPENSE).toBe(0);
  });

  it('ajoute la charge récurrente dès le mois suivant et cumule', () => {
    const second = data.periods[1];
    expect(second.outflows).toBe(130_000);
    expect(second.net).toBe(420_000);
    expect(second.cumulative).toBe(1_870_000);
  });

  it('place le travail planifié à son mois, avec la source et le libellé', () => {
    const january = data.periods.find(period => period.month === '2027-01');
    expect(january?.byCategory.WORKS).toBe(1_200_000);
    expect(january?.lines.find(line => line.category === 'WORKS')).toMatchObject({
      direction: 'OUT',
      amount: 1_200_000,
      propertyId: 'p1',
      propertyTitle: 'Bien p1',
      source: { kind: 'WORK_PROGRAM', id: 'work-1' },
      label: 'Toiture',
      indicative: false,
      note: null
    });
  });

  it('totaux = somme des mois ; aucun creux ; sources déclarées', () => {
    expect(data.totals.net).toBe(data.periods.reduce((sum, period) => sum + period.net, 0));
    expect(data.totals.inflows - data.totals.outflows).toBe(data.totals.net);
    expect(data.shortfall).toBeNull();
    expect(data.openingBalance).toBe(1_000_000);
    expect(data.openingBalanceProvided).toBe(true);
    expect(data.sources.map(source => [source.source, source.status])).toEqual([
      ['RENT', 'INCLUDED'],
      ['LOANS', 'INCLUDED'],
      ['WORKS', 'INCLUDED'],
      ['RECURRING_EXPENSES', 'INCLUDED'],
      ['PROPERTY_TAX', 'NOT_CONFIGURED']
    ]);
    expect(data.warnings).toEqual([]);
  });

  it('chaque ligne est positive et son identifiant est unique', () => {
    const lines = linesOf(data);
    expect(lines.every(line => line.amount > 0)).toBe(true);
    expect(new Set(lines.map(line => line.id)).size).toBe(lines.length);
  });
});

describe('plan de trésorerie — emprunts', () => {
  it("s'arrête au mois de la date de fin : dernière ligne en 2027-01, rien après", () => {
    const data = plan({ loans: [loan({ startDate: d('2026-03-20'), endDate: d('2027-01-20') })] });
    const months = linesOf(data, 'LOAN').map(line => line.month);
    expect(months).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
    expect(data.periods.find(period => period.month === '2027-02')?.byCategory.LOAN).toBe(0);
  });

  it('ignore les prêts clos et ramène le 31 au dernier jour du mois sans dériver', () => {
    const data = plan({
      loans: [
        loan({ id: 'closed', status: 'CLOSED' }),
        loan({ id: 'jan31', startDate: d('2026-01-31'), endDate: d('2028-01-31') })
      ]
    });
    expect(linesOf(data, 'LOAN').every(line => line.source.id === 'jan31')).toBe(true);
    expect(linesOf(data, 'LOAN')).toHaveLength(12);
  });

  it("une mensualité d'aujourd'hui compte, celle d'hier non", () => {
    const today = plan({ loans: [loan({ startDate: d('2026-09-15'), endDate: d('2027-03-15') })] });
    expect(linesOf(today, 'LOAN')[0].month).toBe('2026-10'); // le 15 : aujourd'hui, incluse
    const past = plan({ loans: [loan({ startDate: d('2026-09-14'), endDate: d('2027-03-14') })] });
    expect(linesOf(past, 'LOAN')[0].month).toBe('2026-11'); // le 14 octobre est passé
  });
});

describe('plan de trésorerie — mois sans flux, creux, solde de départ', () => {
  it('un mois sans flux porte des montants à 0 et aucune ligne', () => {
    const data = plan({ works: [work({ plannedDate: d('2027-03-10'), estimatedCost: 200_000 })] });
    const quiet = data.periods[0];
    expect(quiet).toMatchObject({ inflows: 0, outflows: 0, net: 0, cumulative: 0, lines: [] });
    expect(Object.values(quiet.byCategory).every(value => value === 0)).toBe(true);
    expect(data.periods).toHaveLength(12);
  });

  it('détecte le premier mois négatif, la profondeur et le mois le plus bas', () => {
    const data = plan({
      openingBalance: 100_000,
      works: [
        work({ id: 'w1', plannedDate: d('2026-12-05'), estimatedCost: 300_000 }),
        work({ id: 'w2', plannedDate: d('2027-03-05'), estimatedCost: 500_000 })
      ]
    });
    expect(data.shortfall).toEqual({
      firstMonth: '2026-12',
      firstMonthBalance: -200_000,
      deepestMonth: '2027-03',
      depth: 700_000
    });
  });

  it('shortfall est null tant que le cumul reste positif ou nul', () => {
    const data = plan({
      openingBalance: 300_000,
      works: [work({ plannedDate: d('2026-12-05'), estimatedCost: 300_000 })]
    });
    expect(data.periods[2].cumulative).toBe(0);
    expect(data.shortfall).toBeNull();
  });

  it('un solde de départ négatif fait du mois 1 le premier mois du creux', () => {
    const data = plan({ openingBalance: -50_000 });
    expect(data.shortfall).toEqual({
      firstMonth: '2026-10',
      firstMonthBalance: -50_000,
      deepestMonth: '2026-10',
      depth: 50_000
    });
  });

  it('sans solde de départ, le plan le déclare et part de 0', () => {
    const data = plan();
    expect(data.openingBalance).toBe(0);
    expect(data.openingBalanceProvided).toBe(false);
  });
});

describe('plan de trésorerie — taxe foncière', () => {
  const estimate = (propertyId: string, year: number, amount: number, allParametersValidated: boolean) => ({
    propertyId,
    year,
    amount,
    allParametersValidated
  });

  it('sans date d’exigibilité : aucune ligne, source NOT_CONFIGURED, aucune demande au moteur fiscal', () => {
    const data = plan({ taxEstimates: [estimate('p1', 2027, 240_000, true)] });
    expect(linesOf(data, 'PROPERTY_TAX')).toEqual([]);
    expect(sourceOf(data, 'PROPERTY_TAX')).toEqual({
      source: 'PROPERTY_TAX',
      status: 'NOT_CONFIGURED',
      reason: 'TAX_DUE_DATE_NOT_SET',
      count: null
    });
    expect(
      taxEstimateRequests({
        today: TODAY,
        months: 12,
        properties: [property('p1')],
        expenses: [],
        settings: { propertyTaxDueMonth: null, propertyTaxDueDay: null }
      })
    ).toEqual([]);
  });

  it("avec date et paramètres à valider : ligne indicative au mois d'échéance", () => {
    const data = plan({
      settings: { propertyTaxDueMonth: 3, propertyTaxDueDay: 31 },
      taxEstimates: [estimate('p1', 2027, 240_000, false)]
    });
    const [line] = linesOf(data, 'PROPERTY_TAX');
    expect(line).toMatchObject({
      month: '2027-03',
      direction: 'OUT',
      amount: 240_000,
      indicative: true,
      source: { kind: 'TAX_ESTIMATE', id: null }
    });
    expect(sourceOf(data, 'PROPERTY_TAX')?.status).toBe('INCLUDED');
  });

  it('paramètres validés : ligne non indicative', () => {
    const data = plan({
      settings: { propertyTaxDueMonth: 3, propertyTaxDueDay: 31 },
      taxEstimates: [estimate('p1', 2027, 240_000, true)]
    });
    expect(linesOf(data, 'PROPERTY_TAX')[0].indicative).toBe(false);
  });

  it('demande une estimation par bien et par année d’échéance dans la fenêtre', () => {
    const base = {
      today: TODAY,
      properties: [property('p1'), property('p2')],
      expenses: [],
      settings: { propertyTaxDueMonth: 3, propertyTaxDueDay: 31 }
    };
    expect(taxEstimateRequests({ ...base, months: 12 })).toEqual([
      { propertyId: 'p1', year: 2027 },
      { propertyId: 'p2', year: 2027 }
    ]);
    expect(taxEstimateRequests({ ...base, months: 24 }).map(request => request.year)).toEqual([2027, 2028, 2027, 2028]);
  });

  it('ramène le 29 février au 28 les années non bissextiles', () => {
    const dates = listTaxDueDates({ propertyTaxDueMonth: 2, propertyTaxDueDay: 29 }, TODAY, 24);
    expect(dates.map(date => new Date(date.timestamp).toISOString().slice(0, 10))).toEqual([
      '2027-02-28',
      '2028-02-29'
    ]);
  });

  it("une échéance déjà passée ce mois-ci n'est pas comptée (12 mois), elle revient à 24 mois", () => {
    const settings = { propertyTaxDueMonth: 10, propertyTaxDueDay: 5 };
    const short = plan({ settings, taxEstimates: [estimate('p1', 2027, 240_000, true)] });
    expect(linesOf(short, 'PROPERTY_TAX')).toEqual([]);
    expect(sourceOf(short, 'PROPERTY_TAX')).toMatchObject({
      status: 'NO_DATA',
      reason: 'TAX_NO_DUE_DATE_IN_WINDOW',
      count: null
    });
    const long = plan({ months: 24, settings, taxEstimates: [estimate('p1', 2027, 240_000, true)] });
    expect(linesOf(long, 'PROPERTY_TAX').map(line => line.month)).toEqual(['2027-10']);
  });

  it('un bien sans estimation est compté TAX_NOT_ESTIMABLE (PARTIAL si un autre a une ligne)', () => {
    const data = plan({
      properties: [property('p1'), property('p2')],
      settings: { propertyTaxDueMonth: 3, propertyTaxDueDay: 31 },
      taxEstimates: [estimate('p1', 2027, 240_000, true), estimate('p2', 2027, 0, true)]
    });
    expect(sourceOf(data, 'PROPERTY_TAX')).toEqual({
      source: 'PROPERTY_TAX',
      status: 'PARTIAL',
      reason: 'TAX_NOT_ESTIMABLE',
      count: 1
    });
    const none = plan({ settings: { propertyTaxDueMonth: 3, propertyTaxDueDay: 31 } });
    expect(sourceOf(none, 'PROPERTY_TAX')).toEqual({
      source: 'PROPERTY_TAX',
      status: 'NO_DATA',
      reason: 'TAX_NOT_ESTIMABLE',
      count: 1
    });
  });

  it('un bien déjà porteur d’une dépense périodique de taxe foncière : pas de doublon', () => {
    const taxExpense = expense({ id: 'tax-exp', propertyId: 'p2', category: 'PROPERTY_TAX', amount: 90_000 });
    const data = plan({
      properties: [property('p1'), property('p2')],
      expenses: [taxExpense],
      settings: { propertyTaxDueMonth: 3, propertyTaxDueDay: 31 },
      taxEstimates: [estimate('p1', 2027, 240_000, true), estimate('p2', 2027, 777_000, true)]
    });
    expect(linesOf(data, 'PROPERTY_TAX').map(line => line.propertyId)).toEqual(['p1']);
    expect(sourceOf(data, 'PROPERTY_TAX')).toMatchObject({
      status: 'PARTIAL',
      reason: 'TAX_COVERED_BY_RECURRING_EXPENSE',
      count: 1
    });
    expect(
      taxEstimateRequests({
        today: TODAY,
        months: 12,
        properties: [property('p1'), property('p2')],
        expenses: [taxExpense],
        settings: { propertyTaxDueMonth: 3, propertyTaxDueDay: 31 }
      })
    ).toEqual([{ propertyId: 'p1', year: 2027 }]);
  });
});

describe('plan de trésorerie — dépenses périodiques', () => {
  it('mensuelle avec date de fin : jour ramené au dernier jour du mois, fin incluse, rien après', () => {
    const data = plan({
      expenses: [expense({ paidAt: d('2026-08-31'), recurrenceEndDate: d('2027-01-31') })]
    });
    expect(linesOf(data, 'RECURRING_EXPENSE').map(line => line.month)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01'
    ]);
    expect(data.periods.find(period => period.month === '2027-02')?.outflows).toBe(0);
  });

  it('trimestrielle : occurrences tous les 3 mois, celle du jour même comprise', () => {
    const data = plan({ expenses: [expense({ recurrence: 'QUARTERLY', amount: 90_000, paidAt: d('2026-07-15') })] });
    expect(linesOf(data, 'RECURRING_EXPENSE').map(line => line.month)).toEqual([
      '2026-10',
      '2027-01',
      '2027-04',
      '2027-07'
    ]);
  });

  it('annuelle : 1 occurrence sur 12 mois, 2 sur 24 mois', () => {
    const annual = expense({ recurrence: 'ANNUAL', amount: 360_000, paidAt: d('2025-12-01') });
    expect(linesOf(plan({ expenses: [annual] }), 'RECURRING_EXPENSE').map(line => line.month)).toEqual(['2026-12']);
    expect(linesOf(plan({ months: 24, expenses: [annual] }), 'RECURRING_EXPENSE').map(line => line.month)).toEqual([
      '2026-12',
      '2027-12'
    ]);
  });

  it('une date de fin passée ne laisse aucune occurrence', () => {
    const data = plan({ expenses: [expense({ recurrenceEndDate: d('2026-09-30') })] });
    expect(linesOf(data, 'RECURRING_EXPENSE')).toEqual([]);
  });

  it('une dépense ponctuelle est ignorée ; la source est déclarée vide', () => {
    const data = plan({ expenses: [expense({ recurrence: 'ONE_OFF', paidAt: d('2026-11-01') })] });
    expect(linesOf(data)).toEqual([]);
    expect(sourceOf(data, 'RECURRING_EXPENSES')).toEqual({
      source: 'RECURRING_EXPENSES',
      status: 'NO_DATA',
      reason: 'NO_RECURRING_EXPENSE',
      count: null
    });
  });
});

describe('plan de trésorerie — plan 12 vs 24 mois', () => {
  it('24 mois : 24 périodes ; le cumul continue sur toute la durée', () => {
    const data = plan({ months: 24, leases: [lease()] });
    expect(data.months).toBe(24);
    expect(data.periods).toHaveLength(24);
    expect(data.periods[23].month).toBe('2028-09');
    expect(data.periods[23].cumulative).toBe(24 * 550_000);
  });
});

describe('plan de trésorerie — loyers', () => {
  const installment = (overrides: Record<string, unknown> = {}) => ({
    id: 'inst-1',
    leaseId: 'lease-1',
    propertyId: 'p1',
    periodYear: 2026,
    periodMonth: 8,
    dueDate: d('2026-08-05'),
    status: 'OVERDUE',
    currency: 'FCFA',
    amountRent: 400_000,
    amountService: 0,
    amountOtherFees: 0,
    penaltyAmount: 20_000,
    amountPaid: 100_000,
    ...overrides
  });

  it('une échéance impayée en retard est ramenée au mois 1 en RENT_ARREARS, pour le reste dû', () => {
    const data = plan({ installments: [installment()] });
    const [line] = linesOf(data, 'RENT_ARREARS');
    expect(line).toMatchObject({
      month: '2026-10',
      direction: 'IN',
      amount: 320_000,
      source: { kind: 'RENTAL_INSTALLMENT', id: 'inst-1' }
    });
    expect(data.periods[0].byCategory.RENT_ARREARS).toBe(320_000);
  });

  it('une échéance à venir impayée reste à son mois en RENT ; payées, annulées et soldées sont ignorées', () => {
    const data = plan({
      installments: [
        installment({
          id: 'future',
          status: 'DUE',
          dueDate: d('2026-12-05'),
          periodMonth: 12,
          amountPaid: 0,
          penaltyAmount: 0
        }),
        installment({ id: 'paid', status: 'PAID', amountPaid: 420_000 }),
        installment({ id: 'canceled', status: 'CANCELED' }),
        installment({ id: 'settled', status: 'PARTIAL', amountPaid: 420_000 })
      ]
    });
    expect(linesOf(data).map(line => [line.source.id, line.category, line.month, line.amount])).toEqual([
      ['future', 'RENT', '2026-12', 400_000]
    ]);
  });

  it("une période déjà couverte par une échéance (quel que soit son statut) n'est pas générée en double", () => {
    const data = plan({
      leases: [lease()],
      installments: [
        installment({ id: 'nov', status: 'PAID', periodMonth: 11, periodYear: 2026, dueDate: d('2026-11-05') })
      ]
    });
    const scheduleMonths = linesOf(data)
      .filter(line => line.source.kind === 'LEASE_SCHEDULE')
      .map(line => line.month);
    expect(scheduleMonths).toHaveLength(11);
    expect(scheduleMonths).not.toContain('2026-11');
  });

  it('un bail trimestriel ne génère que les périodes de son cycle ; un bail terminé plus rien après sa fin', () => {
    const quarterly = plan({
      leases: [
        lease({
          billingFrequency: 'QUARTERLY',
          startDate: d('2026-01-01'),
          rentAmount: 300_000,
          serviceChargeAmount: 0
        })
      ]
    });
    expect(linesOf(quarterly).map(line => line.month)).toEqual(['2026-10', '2027-01', '2027-04', '2027-07']);
    const ending = plan({ leases: [lease({ endDate: d('2026-12-31') })] });
    expect(linesOf(ending).map(line => line.month)).toEqual(['2026-10', '2026-11', '2026-12']);
  });

  it('un bail sans loyer ne produit rien ; la source est déclarée vide', () => {
    const data = plan({ leases: [lease({ rentAmount: 0 })] });
    expect(linesOf(data)).toEqual([]);
    expect(sourceOf(data, 'RENT')).toMatchObject({ status: 'NO_DATA', reason: 'NO_FLOW_IN_PERIOD' });
  });
});

describe('plan de trésorerie — travaux', () => {
  it('un travail à date dépassée est ramené au mois 1 avec une note', () => {
    const data = plan({ works: [work({ plannedDate: d('2026-05-01') })] });
    const [line] = linesOf(data, 'WORKS');
    expect(line.month).toBe('2026-10');
    expect(line.note).toBe('DATE_PASSED_MOVED_TO_FIRST_MONTH');
  });

  it('un travail en cours déjà entamé ne compte que le reste à payer', () => {
    const data = plan({
      works: [
        work({ status: 'IN_PROGRESS', estimatedCost: 1_000_000, actualCost: 400_000, plannedDate: d('2026-12-10') })
      ]
    });
    const [line] = linesOf(data, 'WORKS');
    expect(line).toMatchObject({ amount: 600_000, month: '2026-12', note: 'REMAINING_AFTER_ACTUAL_COST' });
  });

  it('hors fenêtre, terminés ou annulés : ignorés', () => {
    const data = plan({
      works: [
        work({ id: 'far', plannedDate: d('2028-01-10') }),
        work({ id: 'done', status: 'COMPLETED' }),
        work({ id: 'cancelled', status: 'CANCELLED' }),
        work({ id: 'over', status: 'IN_PROGRESS', estimatedCost: 100_000, actualCost: 150_000 })
      ]
    });
    expect(linesOf(data)).toEqual([]);
    expect(sourceOf(data, 'WORKS')).toMatchObject({ status: 'NO_DATA', reason: 'NO_FLOW_IN_PERIOD' });
  });
});

describe('plan de trésorerie — périmètre des biens', () => {
  it('exclut les biens en vente, vendus, archivés et brouillons, et les déclare', () => {
    const data = plan({
      properties: [
        property('p1'),
        property('sale', { transactionModes: ['SALE'] }),
        property('sold', { status: 'SOLD' }),
        property('arch', { status: 'ARCHIVED' }),
        property('draft', { status: 'DRAFT' }),
        property('mixed', { transactionModes: ['SALE', 'RENTAL'] })
      ],
      loans: [loan({ propertyId: 'sale' }), loan({ id: 'loan-mixed', propertyId: 'mixed' })]
    });
    expect(data.scope.propertyCount).toBe(2);
    expect(data.scope.excluded.map(item => [item.propertyId, item.reason])).toEqual([
      ['sale', 'FOR_SALE'],
      ['sold', 'SOLD'],
      ['arch', 'ARCHIVED'],
      ['draft', 'DRAFT']
    ]);
    expect(linesOf(data, 'LOAN').every(line => line.propertyId === 'mixed')).toBe(true);
  });

  it('le filtre propertyId restreint le plan à ce bien ; un bien exclu donne un plan vide', () => {
    const properties = [property('p1'), property('sale', { transactionModes: ['SALE'] })];
    const loans = [loan({ propertyId: 'p1' }), loan({ id: 'l2', propertyId: 'sale' })];
    const one = plan({ properties, loans, propertyId: 'p1' });
    expect(one.propertyId).toBe('p1');
    expect(one.scope.propertyCount).toBe(1);
    expect(linesOf(one, 'LOAN').every(line => line.propertyId === 'p1')).toBe(true);
    const excluded = plan({ properties, loans, propertyId: 'sale' });
    expect(excluded.scope).toEqual({
      propertyCount: 0,
      excluded: [{ propertyId: 'sale', title: 'Bien sale', reason: 'FOR_SALE' }]
    });
    expect(linesOf(excluded)).toEqual([]);
    expect(sourceOf(excluded, 'LOANS')).toMatchObject({ status: 'NO_DATA', reason: 'NO_ELIGIBLE_PROPERTY' });
  });

  it('classifyProperties applique la priorité statut puis vente', () => {
    expect(classifyProperties([property('x', { status: 'SOLD', transactionModes: ['SALE'] })]).excluded[0].reason).toBe(
      'SOLD'
    );
  });
});

describe('plan de trésorerie — devises', () => {
  it('FCFA et XOF sont équivalents ; toute autre devise est écartée et comptée, jamais sommée', () => {
    const data = plan({
      leases: [lease({ id: 'eur', currency: 'EUR' }), lease({ id: 'fcfa', currency: 'fcfa' })],
      loans: [loan({ currency: 'USD' })],
      works: [work({ currency: 'XOF' })]
    });
    expect(linesOf(data, 'RENT').every(line => line.source.id === 'fcfa')).toBe(true);
    expect(linesOf(data, 'LOAN')).toEqual([]);
    expect(linesOf(data, 'WORKS')).toHaveLength(1);
    expect(data.warnings).toEqual([{ code: 'FOREIGN_CURRENCY_SKIPPED', count: 2 }]);
  });
});

describe('plan de trésorerie — sources vides', () => {
  it('chaque source sans donnée est déclarée avec sa raison', () => {
    const data = plan();
    expect(data.sources).toEqual([
      { source: 'RENT', status: 'NO_DATA', reason: 'NO_ACTIVE_LEASE', count: null },
      { source: 'LOANS', status: 'NO_DATA', reason: 'NO_ACTIVE_LOAN', count: null },
      { source: 'WORKS', status: 'NO_DATA', reason: 'NO_PLANNED_WORK', count: null },
      { source: 'RECURRING_EXPENSES', status: 'NO_DATA', reason: 'NO_RECURRING_EXPENSE', count: null },
      { source: 'PROPERTY_TAX', status: 'NOT_CONFIGURED', reason: 'TAX_DUE_DATE_NOT_SET', count: null }
    ]);
    expect(data.shortfall).toBeNull();
  });

  it('sans aucun bien retenu : NO_ELIGIBLE_PROPERTY partout (la taxe reste « non configurée » sans date)', () => {
    const data = plan({ properties: [] });
    expect(data.sources.map(source => source.reason)).toEqual([
      'NO_ELIGIBLE_PROPERTY',
      'NO_ELIGIBLE_PROPERTY',
      'NO_ELIGIBLE_PROPERTY',
      'NO_ELIGIBLE_PROPERTY',
      'TAX_DUE_DATE_NOT_SET'
    ]);
    expect(data.periods).toHaveLength(12);
  });
});

describe('ancres très anciennes (déni de service)', () => {
  it("une dépense mensuelle ancrée en 1990 donne les mêmes lignes qu'une ancre récente de même jour", () => {
    const old = plan({ expenses: [expense({ id: 'old', paidAt: d('1990-01-20') })] });
    const recent = plan({ expenses: [expense({ id: 'recent', paidAt: d('2026-09-20') })] });
    const monthsOf = (data: ReturnType<typeof plan>) => linesOf(data, 'RECURRING_EXPENSE').map(line => line.month);
    expect(monthsOf(old)).toEqual(monthsOf(recent));
    expect(monthsOf(old)).toHaveLength(12);
  });

  it('un prêt et une dépense ancrés avant notre ère ne bloquent pas le calcul', () => {
    const started = Date.now();
    const data = plan({
      loans: [loan({ id: 'loan-old', startDate: new Date('-004712-01-02T00:00:00Z'), endDate: d('2027-03-20') })],
      expenses: [expense({ id: 'exp-old', paidAt: new Date('-004712-01-02T00:00:00Z') })]
    });
    expect(Date.now() - started).toBeLessThan(500);
    expect(linesOf(data, 'LOAN').map(line => line.month)[0]).toBe('2026-11');
    expect(linesOf(data, 'LOAN').at(-1)?.month).toBe('2027-03');
    expect(linesOf(data, 'RECURRING_EXPENSE')).toHaveLength(11);
  });
});
