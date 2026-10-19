/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Realise d'un budget de copropriete : factures + imputations d'incident non
 * liees a une ecriture, et validation de la periode d'un appel annuel.
 */

const mockImputationFindMany = jest.fn();
const mockInvoiceFindMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    incidentCostImputation: { findMany: (...a: any[]) => mockImputationFindMany(...a) },
    syndicProviderInvoice: { findMany: (...a: any[]) => mockInvoiceFindMany(...a) }
  }
}));

import { attachBudgetActuals, computeBudgetActuals } from '../../src/lib/syndics/budget-actuals';
import { generateBudgetChargeCallsSchema } from '../../src/lib/syndics/schemas';

const TENANT = 'tenant-1';
const SYNDIC = 'syndic-1';
const budget = {
  id: 'b1',
  fiscalYear: 2026,
  lines: [
    { id: 'l1', amountActual: '100000.00' },
    { id: 'l2', amountActual: 0 }
  ]
};

/** Route les findMany des imputations selon que le filtre cible les postes ou les orphelines. */
function seed(opts: { attached?: any[]; loose?: any[]; invoices?: any[] }) {
  mockImputationFindMany.mockImplementation(async (args: any) =>
    args.where.budgetLineId === null ? (opts.loose ?? []) : (opts.attached ?? [])
  );
  mockInvoiceFindMany.mockResolvedValue(opts.invoices ?? []);
}

describe('computeBudgetActuals', () => {
  beforeEach(() => jest.clearAllMocks());

  it('(a) additionne la facture rattachee (amountActual) et l imputation non facturee', async () => {
    seed({
      attached: [
        { budgetLineId: 'l1', amount: '25000.50', createdAt: new Date('2026-03-10T00:00:00Z'), journalEntryId: null }
      ]
    });
    const res = await computeBudgetActuals(TENANT, SYNDIC, [budget]);
    expect(res.b1.lines.l1).toEqual({ actualIncidents: 25000.5, actualTotal: 125000.5 });
    expect(res.b1.lines.l2).toEqual({ actualIncidents: 0, actualTotal: 0 });
    expect(res.b1.actualTotal).toBe(125000.5);
    expect(mockImputationFindMany).toHaveBeenCalledTimes(2);
    expect(mockInvoiceFindMany).toHaveBeenCalledTimes(1);
    const where = mockImputationFindMany.mock.calls[0][0].where;
    expect(where.journalEntryId).toBeNull();
    expect(where.incident).toEqual({ syndicateId: SYNDIC, syndicate: { tenantId: TENANT } });
  });

  it('(b) une imputation liee a une ecriture n est jamais comptee', async () => {
    seed({
      attached: [
        { budgetLineId: 'l1', amount: 9000, createdAt: new Date('2026-03-10T00:00:00Z'), journalEntryId: 'je-1' }
      ],
      loose: [{ budgetLineId: null, amount: 700, createdAt: new Date('2026-03-10T00:00:00Z'), journalEntryId: 'je-2' }]
    });
    const res = await computeBudgetActuals(TENANT, SYNDIC, [budget]);
    expect(res.b1.lines.l1.actualIncidents).toBe(0);
    expect(res.b1.unattached.imputationsCount).toBe(0);
  });

  it('(c) une imputation sans poste va dans unattached', async () => {
    seed({
      loose: [
        { budgetLineId: null, amount: 1200.25, createdAt: new Date('2026-05-01T00:00:00Z'), journalEntryId: null },
        { budgetLineId: null, amount: 100, createdAt: new Date('2025-12-31T23:59:59Z'), journalEntryId: null }
      ]
    });
    const res = await computeBudgetActuals(TENANT, SYNDIC, [budget]);
    expect(res.b1.unattached.imputationsCount).toBe(1);
    expect(res.b1.unattached.imputationsAmount).toBe(1200.25);
    expect(res.b1.actualTotal).toBe(100000);
    const where = mockImputationFindMany.mock.calls[1][0].where;
    expect(where.budgetLineId).toBeNull();
    expect(where.journalEntryId).toBeNull();
  });

  it('(d) facture annulee ou hors exercice ignoree, filtres tenant/copropriete poses', async () => {
    seed({
      invoices: [
        {
          amountTTC: '5000',
          invoiceDate: new Date('2026-02-01T00:00:00Z'),
          budgetLineItemId: null,
          status: 'RECORDED'
        },
        {
          amountTTC: '7000',
          invoiceDate: new Date('2026-02-01T00:00:00Z'),
          budgetLineItemId: null,
          status: 'CANCELLED'
        },
        { amountTTC: '9000', invoiceDate: new Date('2027-01-01T00:00:00Z'), budgetLineItemId: null, status: 'PAID' }
      ]
    });
    const res = await computeBudgetActuals(TENANT, SYNDIC, [budget]);
    expect(res.b1.unattached).toMatchObject({ invoicesCount: 1, invoicesAmount: 5000 });
    const where = mockInvoiceFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tenantId: TENANT,
      syndicateId: SYNDIC,
      budgetLineItemId: null,
      status: { not: 'CANCELLED' }
    });
  });

  it('(f) imputation rattachee datee d une autre annee : comptee sur le poste', async () => {
    seed({
      attached: [{ budgetLineId: 'l1', amount: 400, createdAt: new Date('2024-02-01T00:00:00Z'), journalEntryId: null }]
    });
    const res = await computeBudgetActuals(TENANT, SYNDIC, [budget]);
    expect(res.b1.lines.l1).toEqual({ actualIncidents: 400, actualTotal: 100400 });
    expect(mockImputationFindMany.mock.calls[0][0].where.createdAt).toBeUndefined();
  });

  it('(e) liste vide : aucune requete', async () => {
    expect(await computeBudgetActuals(TENANT, SYNDIC, [])).toEqual({});
    expect(await attachBudgetActuals(TENANT, SYNDIC, [])).toEqual([]);
    expect(mockImputationFindMany).not.toHaveBeenCalled();
    expect(mockInvoiceFindMany).not.toHaveBeenCalled();
  });

  it('attachBudgetActuals enrichit budgets et postes, amountActual inchange', async () => {
    seed({
      attached: [{ budgetLineId: 'l2', amount: 300, createdAt: new Date('2026-06-01T00:00:00Z'), journalEntryId: null }]
    });
    const [out] = await attachBudgetActuals(TENANT, SYNDIC, [{ ...budget, name: 'x' }]);
    expect((out as any).name).toBe('x');
    expect(out.actualTotal).toBe(100300);
    expect(out.lines?.[0]).toMatchObject({
      id: 'l1',
      amountActual: '100000.00',
      actualIncidents: 0,
      actualTotal: 100000
    });
    expect(out.lines?.[1]).toMatchObject({ actualIncidents: 300, actualTotal: 300 });
  });
});

describe('generateBudgetChargeCallsSchema - periode', () => {
  const base = { label: 'Appels', dueDate: '2026-04-30', batchType: 'REGULAR' as const };

  it('refuse AAAA-MM pour un appel annuel', () => {
    for (const periodsPerYear of [undefined, 1]) {
      const r = generateBudgetChargeCallsSchema.safeParse({ ...base, period: '2026-01', periodsPerYear });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues[0].path).toEqual(['period']);
        expect(r.error.issues[0].message).toContain('AAAA');
      }
    }
  });

  it('accepte AAAA pour un appel annuel', () => {
    expect(generateBudgetChargeCallsSchema.safeParse({ ...base, period: '2026', periodsPerYear: 1 }).success).toBe(
      true
    );
  });

  it('accepte AAAA-MM pour un appel mensuel', () => {
    expect(
      generateBudgetChargeCallsSchema.safeParse({ ...base, period: '2026-01', periodsPerYear: 12, periodIndex: 1 })
        .success
    ).toBe(true);
  });
});
