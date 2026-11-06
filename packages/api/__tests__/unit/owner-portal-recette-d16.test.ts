/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Recette du portail propriétaire (bloc 12) — lot D16.
 *
 *  - 005 : rapport de revenus sur le bien d'un autre propriétaire -> 404 typé.
 *  - 006 : « reste à payer » = échéances exigibles non soldées ; l'à-venir à part.
 *  - 008 : occupation calculée à la date demandée, pas le statut courant du bien.
 *  - 009 : mois du rapport de revenus dans la langue de l'utilisateur.
 *  - 011 : « montant retenu » = retenues réelles, distinct du montant détenu.
 */

const mockDb = {
  rentalPayment: { findMany: jest.fn() },
  property: { findMany: jest.fn() },
  rentalLease: { findFirst: jest.fn() },
  rentalLeaseCoRenter: { findMany: jest.fn() },
  rentalInstallment: { findMany: jest.fn() },
  rentalPaymentAllocation: { aggregate: jest.fn() },
  rentalSecurityDeposit: { findUnique: jest.fn(), findMany: jest.fn() }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockDb }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/document-generation-service', () => ({ getDocumentFile: jest.fn() }));

const mockRevenueCsv = jest.fn(async () => Buffer.from('ok'));
const mockOccupancyCsv = jest.fn(async () => Buffer.from('ok'));
jest.mock('../../src/utils/report-generator', () => ({
  generateRevenueReportPDF: jest.fn(),
  generateRevenueReportCSV: (...a: any[]) => (mockRevenueCsv as any)(...a),
  generateRevenueReportExcel: jest.fn(),
  generateOccupancyReportPDF: jest.fn(),
  generateOccupancyReportCSV: (...a: any[]) => (mockOccupancyCsv as any)(...a),
  generateOccupancyReportExcel: jest.fn(),
  exportData: jest.fn()
}));

import { OwnerPortalService } from '../../src/services/owner-portal-service';
import { NotFoundError } from '../../src/middleware/error-middleware';

const service = new OwnerPortalService();
const TENANT = 'tenant-1';
const OWN = 'prop-own';
const FOREIGN = 'prop-foreign';

beforeEach(() => jest.clearAllMocks());

describe('BUG-2026-11-04-005 — rapport de revenus hors périmètre', () => {
  it('lève NotFoundError (404) sans interroger la base', async () => {
    await expect(
      service.generateRevenueReport([OWN], TENANT, {
        startDate: new Date('2026-10-01'),
        endDate: new Date('2026-10-31'),
        propertyId: FOREIGN,
        format: 'csv'
      })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockDb.rentalPayment.findMany).not.toHaveBeenCalled();
  });

  it('un bien du périmètre est filtré sur lui seul', async () => {
    mockDb.rentalPayment.findMany.mockResolvedValue([]);
    await service.generateRevenueReport([OWN, 'autre'], TENANT, {
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-31'),
      propertyId: OWN,
      format: 'csv'
    });
    expect(mockDb.rentalPayment.findMany.mock.calls[0][0].where.lease).toEqual({ property_id: { in: [OWN] } });
  });
});

describe('BUG-2026-11-04-009 — mois du rapport de revenus', () => {
  it('écrit le mois en français, pas « October 2026 »', async () => {
    mockDb.rentalPayment.findMany.mockResolvedValue([
      {
        amount: 1000,
        succeeded_at: new Date('2026-10-15T12:00:00Z'),
        lease: { property_id: OWN, property: { id: OWN, address: '1 rue A' } }
      }
    ]);
    await service.generateRevenueReport([OWN], TENANT, {
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-31'),
      format: 'csv'
    });
    const data = (mockRevenueCsv.mock.calls[0] as any[])[0];
    expect(data.revenuesByMonth[0].month).toBe('octobre 2026');
  });
});

describe('BUG-2026-11-04-008 — occupation à la date demandée', () => {
  it('un bien RENTED sans bail à la date est « Disponible », un bien avec bail est « Loué »', async () => {
    mockDb.property.findMany.mockResolvedValue([
      { id: 'p1', address: '104 Rue du Canal', status: 'RENTED', rentalLeases: [] },
      {
        id: 'p2',
        address: '60 Rue des Jardins',
        status: 'AVAILABLE',
        rentalLeases: [
          {
            lease_number: 'BAIL-1',
            start_date: new Date('2026-01-01'),
            end_date: null,
            primaryRenter: { user: { fullName: 'Locataire' } }
          }
        ]
      }
    ]);
    await service.generateOccupancyReport([OWN], TENANT, { asOfDate: new Date('2026-09-30'), format: 'csv' });
    const data = (mockOccupancyCsv.mock.calls[0] as any[])[0];
    expect(data.properties.map((p: any) => p.status)).toEqual(['Disponible', 'Loué']);
    expect(data.occupiedProperties).toBe(1);
    expect(data.availableProperties).toBe(1);
  });
});

describe('BUG-2026-11-04-006 — reste à payer = exigible non soldé', () => {
  const installment = (over: Record<string, unknown>) => ({
    status: 'DUE',
    amount_rent: 37000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    ...over
  });

  it("exclut l'échéance non échue du reste dû et la totalise à part", async () => {
    mockDb.rentalLease.findFirst.mockResolvedValue({ id: 'l1', property: {}, primaryRenter: null, ownerClient: null });
    mockDb.rentalLeaseCoRenter.findMany.mockResolvedValue([]);
    mockDb.rentalInstallment.findMany.mockResolvedValue([
      installment({ status: 'DUE', due_date: new Date('2099-12-01'), period_month: 12, period_year: 2099 }),
      installment({
        status: 'PARTIAL',
        amount_paid: 18500,
        due_date: new Date('2020-11-01'),
        period_month: 11,
        period_year: 2020
      }),
      installment({ status: 'PAID', amount_paid: 37000, due_date: new Date('2020-10-01') })
    ]);
    mockDb.rentalPaymentAllocation.aggregate.mockResolvedValue({ _sum: { amount: 55500 } });
    mockDb.rentalSecurityDeposit.findUnique.mockResolvedValue(null);
    (mockDb as any).rentalPayment.findMany.mockResolvedValue([]);

    const result: any = await service.getLeaseDetails('l1', [OWN], TENANT);
    expect(result.balance.totalDue).toBe(111000);
    expect(result.balance.remaining).toBe(18500);
    expect(result.balance.upcoming).toBe(37000);
  });
});

describe('BUG-2026-11-04-011 — dépôts : retenu distinct de détenu', () => {
  const lease = { property: { id: 'p', address: 'A' }, primaryRenter: { user: { fullName: 'X' } } };

  it('un dépôt intact a 0 retenu ; une confiscation compte comme retenue', async () => {
    mockDb.rentalSecurityDeposit.findMany.mockResolvedValue([
      {
        id: 'd1',
        target_amount: 240000,
        collected_amount: 240000,
        held_amount: 0,
        refunded_amount: 0,
        forfeited_amount: 0,
        lease
      },
      {
        id: 'd2',
        target_amount: 200000,
        collected_amount: 200000,
        held_amount: 0,
        refunded_amount: 154000,
        forfeited_amount: 46000,
        lease
      }
    ]);
    const result: any = await service.getDeposits([OWN], TENANT);
    const [intact, partial] = result.deposits;
    expect(intact.currentHeldAmount).toBe(240000);
    expect(intact.withheldAmount).toBe(0);
    expect(partial.currentHeldAmount).toBe(0);
    expect(partial.withheldAmount).toBe(46000);
    expect(result.summary.totalHeld).toBe(240000);
    expect(result.summary.totalWithheld).toBe(46000);
  });
});
