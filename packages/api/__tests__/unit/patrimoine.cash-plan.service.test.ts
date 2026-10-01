/**
 * Service du plan de trésorerie (spec 030) : chargement filtré par agence,
 * moteur fiscal appelé seulement quand la date d'exigibilité est renseignée,
 * par lots de 5, bien d'une autre agence refusé.
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
jest.mock('../../src/utils/property-tenant-guard', () => ({ getPropertyForTenant: jest.fn() }));
jest.mock('../../src/lib/patrimoine/tax/service', () => ({ getPropertyTaxEstimate: jest.fn() }));

import { getPropertyForTenant } from '../../src/utils/property-tenant-guard';
import { getPropertyTaxEstimate } from '../../src/lib/patrimoine/tax/service';
import { NotFoundError } from '../../src/middleware/error-middleware';
import { getCashPlan, propertyTaxAmountOf, updateCashPlanSettings } from '../../src/lib/patrimoine/cash-plan-service';

const TODAY = new Date('2026-10-15T10:00:00Z');
const TENANT = 'tenant-1';

const mockEstimate = getPropertyTaxEstimate as jest.Mock;
const mockGuard = getPropertyForTenant as jest.Mock;

function propertyRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    title: `Bien ${index + 1}`,
    status: 'RENTED',
    transactionModes: ['RENTAL']
  }));
}

function taxEstimate(amountFull: number, validated = true, rentalValidated = true) {
  return {
    allParametersValidated: validated && rentalValidated,
    holders: [
      {
        sharePercent: 100,
        taxes: [
          { taxKind: 'PROPERTY_TAX', amountFull, applicable: true, allParametersValidated: validated },
          {
            taxKind: 'RENTAL_INCOME_TAX',
            amountFull: 999_999,
            applicable: true,
            allParametersValidated: rentalValidated
          }
        ]
      }
    ]
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.property.findMany.mockResolvedValue(propertyRows(1));
  mockPrisma.patrimonyCashPlanSettings.findUnique.mockResolvedValue(null);
  for (const model of ['rentalLease', 'rentalInstallment', 'propertyLoan', 'workProgram', 'propertyExpense'] as const) {
    mockPrisma[model].findMany.mockResolvedValue([]);
  }
});

describe('getCashPlan — isolation par agence', () => {
  it("filtre chaque lecture par tenantId et par les seuls biens retenus de l'agence", async () => {
    mockPrisma.property.findMany.mockResolvedValue([
      ...propertyRows(1),
      { id: 'sold', title: 'Vendu', status: 'SOLD', transactionModes: ['RENTAL'] }
    ]);
    await getCashPlan(TENANT, { months: 12 }, TODAY);

    expect(mockPrisma.property.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: TENANT,
      ownershipType: 'TENANT'
    });
    expect(mockPrisma.rentalLease.findMany.mock.calls[0][0].where).toMatchObject({
      tenant_id: TENANT,
      property_id: { in: ['p1'] },
      status: 'ACTIVE'
    });
    expect(mockPrisma.rentalInstallment.findMany.mock.calls[0][0].where).toMatchObject({ tenant_id: TENANT });
    for (const model of ['propertyLoan', 'workProgram', 'propertyExpense'] as const) {
      expect(mockPrisma[model].findMany.mock.calls[0][0].where).toMatchObject({
        tenantId: TENANT,
        propertyId: { in: ['p1'] }
      });
    }
    expect(mockPrisma.patrimonyCashPlanSettings.findUnique.mock.calls[0][0].where).toEqual({ tenantId: TENANT });
  });

  it("vérifie le bien demandé par agence : un bien d'une autre agence lève la même 404 qu'un bien inexistant", async () => {
    mockGuard.mockRejectedValueOnce(new NotFoundError('Bien introuvable.'));
    await expect(getCashPlan(TENANT, { months: 12, propertyId: 'foreign' }, TODAY)).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(mockGuard).toHaveBeenCalledWith('foreign', TENANT);
    expect(mockPrisma.property.findMany).not.toHaveBeenCalled();
  });

  it('restreint la lecture des biens au bien demandé', async () => {
    mockGuard.mockResolvedValueOnce({ id: 'p1' });
    await getCashPlan(TENANT, { months: 12, propertyId: 'p1' }, TODAY);
    expect(mockPrisma.property.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: TENANT, id: 'p1' });
  });

  it('ne charge que les dépenses périodiques', async () => {
    await getCashPlan(TENANT, { months: 12 }, TODAY);
    expect(mockPrisma.propertyExpense.findMany.mock.calls[0][0].where.recurrence).toEqual({ not: 'ONE_OFF' });
  });
});

describe('getCashPlan — moteur fiscal', () => {
  it("n'appelle PAS le moteur fiscal sans date d'exigibilité", async () => {
    const data = await getCashPlan(TENANT, { months: 12 }, TODAY);
    expect(mockEstimate).not.toHaveBeenCalled();
    expect(data.sources.find(source => source.source === 'PROPERTY_TAX')).toMatchObject({
      status: 'NOT_CONFIGURED',
      reason: 'TAX_DUE_DATE_NOT_SET'
    });
  });

  it('avec une date : une estimation par bien et par année, uniquement la taxe foncière, ligne indicative si à valider', async () => {
    mockPrisma.patrimonyCashPlanSettings.findUnique.mockResolvedValue({
      propertyTaxDueMonth: 3,
      propertyTaxDueDay: 31
    });
    mockEstimate.mockResolvedValue(taxEstimate(240_000, false));
    const data = await getCashPlan(TENANT, { months: 12 }, TODAY);

    expect(mockEstimate).toHaveBeenCalledTimes(1);
    expect(mockEstimate).toHaveBeenCalledWith(TENANT, 'p1', { year: 2027 });
    const [line] = data.periods.flatMap(period => period.lines).filter(item => item.category === 'PROPERTY_TAX');
    expect(line).toMatchObject({ month: '2027-03', amount: 240_000, indicative: true });
  });

  it('appelle le moteur par lots de 5 au plus', async () => {
    mockPrisma.property.findMany.mockResolvedValue(propertyRows(12));
    mockPrisma.patrimonyCashPlanSettings.findUnique.mockResolvedValue({
      propertyTaxDueMonth: 3,
      propertyTaxDueDay: 31
    });
    let running = 0;
    let peak = 0;
    mockEstimate.mockImplementation(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise(resolve => setImmediate(resolve));
      running -= 1;
      return taxEstimate(100_000);
    });
    await getCashPlan(TENANT, { months: 12 }, TODAY);
    expect(mockEstimate).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(5);
  });

  it('propertyTaxAmountOf ignore la taxe sur revenus locatifs et applique la part de chaque détenteur', () => {
    const estimate = {
      holders: [
        { sharePercent: 60, taxes: [{ taxKind: 'PROPERTY_TAX', amountFull: 100_000 }] },
        {
          sharePercent: 40,
          taxes: [
            { taxKind: 'PROPERTY_TAX', amountFull: 100_000 },
            { taxKind: 'RENTAL_INCOME_TAX', amountFull: 50_000 }
          ]
        }
      ]
    };
    expect(propertyTaxAmountOf(estimate as never)).toBe(100_000);
  });
});

describe('updateCashPlanSettings', () => {
  it("fait un upsert sur l'agence", async () => {
    mockPrisma.patrimonyCashPlanSettings.upsert.mockResolvedValue({
      propertyTaxDueMonth: 3,
      propertyTaxDueDay: 31,
      updatedAt: TODAY
    });
    await updateCashPlanSettings(TENANT, 'user-1', { propertyTaxDueMonth: 3, propertyTaxDueDay: 31 });
    const call = mockPrisma.patrimonyCashPlanSettings.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ tenantId: TENANT });
    expect(call.create).toMatchObject({ tenantId: TENANT, updatedByUserId: 'user-1' });
  });
});
