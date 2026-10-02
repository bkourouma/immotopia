/**
 * Service du plan de trésorerie — corrections de relecture : estimation fiscale
 * isolée (échec toléré), `indicative` limité à la taxe foncière, chargement des
 * échéances par période.
 */

const mockPrisma = {
  property: { findMany: jest.fn() },
  patrimonyCashPlanSettings: { findUnique: jest.fn(), upsert: jest.fn() },
  rentalLease: { findMany: jest.fn() },
  rentalInstallment: { findMany: jest.fn() },
  propertyLoan: { findMany: jest.fn() },
  workProgram: { findMany: jest.fn() },
  propertyExpense: { findMany: jest.fn() }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('../../src/utils/property-tenant-guard', () => ({ getPropertyForTenant: jest.fn() }));
jest.mock('../../src/lib/patrimoine/tax/service', () => ({ getPropertyTaxEstimate: jest.fn() }));

import { logger } from '../../src/utils/logger';
import { getPropertyTaxEstimate } from '../../src/lib/patrimoine/tax/service';
import { getCashPlan } from '../../src/lib/patrimoine/cash-plan-service';

const TODAY = new Date('2026-10-15T10:00:00Z');
const TENANT = 'tenant-1';
const SETTINGS = { propertyTaxDueMonth: 3, propertyTaxDueDay: 31 };
const mockEstimate = getPropertyTaxEstimate as jest.Mock;

const rows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    title: `Bien ${index + 1}`,
    status: 'RENTED',
    transactionModes: ['RENTAL']
  }));

function estimate(propertyTaxValidated: boolean, rentalValidated: boolean) {
  return {
    allParametersValidated: propertyTaxValidated && rentalValidated,
    holders: [
      {
        sharePercent: 100,
        taxes: [
          {
            taxKind: 'PROPERTY_TAX',
            amountFull: 100_000,
            applicable: true,
            allParametersValidated: propertyTaxValidated
          },
          {
            taxKind: 'RENTAL_INCOME_TAX',
            amountFull: 50_000,
            applicable: true,
            allParametersValidated: rentalValidated
          }
        ]
      }
    ]
  };
}

const taxLines = (data: Awaited<ReturnType<typeof getCashPlan>>) =>
  data.periods.flatMap(period => period.lines).filter(line => line.category === 'PROPERTY_TAX');

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.property.findMany.mockResolvedValue(rows(1));
  mockPrisma.patrimonyCashPlanSettings.findUnique.mockResolvedValue(SETTINGS);
  for (const model of ['rentalLease', 'rentalInstallment', 'propertyLoan', 'workProgram', 'propertyExpense'] as const) {
    mockPrisma[model].findMany.mockResolvedValue([]);
  }
});

describe('getCashPlan — corrections de relecture', () => {
  it("une estimation en échec n'abat pas le plan : couple non estimable, avertissement journalisé", async () => {
    mockPrisma.property.findMany.mockResolvedValue(rows(2));
    mockEstimate.mockImplementation(async (_tenant: string, propertyId: string) => {
      if (propertyId === 'p1') throw new Error('boom');
      return estimate(true, true);
    });
    const data = await getCashPlan(TENANT, { months: 12 }, TODAY);
    expect(taxLines(data).map(line => line.propertyId)).toEqual(['p2']);
    expect(data.sources.find(source => source.source === 'PROPERTY_TAX')).toMatchObject({
      status: 'PARTIAL',
      reason: 'TAX_NOT_ESTIMABLE',
      count: 1
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('indicative ne dépend que des paramètres de la taxe foncière, pas de la taxe sur revenus locatifs', async () => {
    mockEstimate.mockResolvedValue(estimate(true, false));
    expect(taxLines(await getCashPlan(TENANT, { months: 12 }, TODAY))[0].indicative).toBe(false);
    mockEstimate.mockResolvedValue(estimate(false, true));
    expect(taxLines(await getCashPlan(TENANT, { months: 12 }, TODAY))[0].indicative).toBe(true);
  });

  it('charge les échéances par période (année, mois) ≥ mois courant UTC', async () => {
    mockPrisma.patrimonyCashPlanSettings.findUnique.mockResolvedValue(null);
    await getCashPlan(TENANT, { months: 12 }, TODAY);
    const { OR } = mockPrisma.rentalInstallment.findMany.mock.calls[0][0].where;
    expect(OR).toContainEqual({ period_year: { gt: 2026 } });
    expect(OR).toContainEqual({ period_year: 2026, period_month: { gte: 10 } });
  });
});
