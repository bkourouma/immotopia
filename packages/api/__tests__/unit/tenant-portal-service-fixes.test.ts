/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Recette gestion locative du 03/11/2026 — portail locataire :
 * BUG-005 (échéance Partielle), BUG-006 (brouillon/annulée), BUG-007 (404),
 * BUG-008 (motif de rejet). Prisma est simulé.
 */
const prismaMock: any = {
  rentalLease: { findFirst: jest.fn() },
  rentalInstallment: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  rentalPaymentAllocation: { aggregate: jest.fn() },
  rentalPayment: { findMany: jest.fn(), aggregate: jest.fn() },
  rentalPaymentDeclaration: { findMany: jest.fn(), create: jest.fn() },
  rentalSecurityDeposit: { findUnique: jest.fn() },
  rentalDocument: { findFirst: jest.fn() },
  maintenanceTicket: { groupBy: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/lib/maintenance/portal-visibility', () => ({
  findTenantPortalTicket: jest.fn(),
  resolveTenantPortalCrmContactId: jest.fn(),
  tenantPortalTicketFilter: jest.fn().mockResolvedValue({})
}));

import { TenantPortalService } from '../../src/services/tenant-portal-service';
import { BadRequestError, NotFoundError } from '../../src/middleware/error-middleware';

const service = new TenantPortalService();
const UUID = '00000000-0000-4000-8000-000000000000';

const base = {
  amount_service: 0,
  amount_other_fees: 0,
  penalty_amount: 0,
  amount_paid: 0,
  payments: [],
  items: [],
  period_year: 2026,
  period_month: 10
};
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('dashboard — échéance partielle (BUG-2026-11-03-005)', () => {
  it('compte le reste dû de la Partielle et la signale en retard', async () => {
    const installments = [
      {
        ...base,
        id: 'p',
        status: 'PARTIAL',
        due_date: daysFromNow(-30),
        amount_rent: 480_000,
        penalty_amount: 12_000,
        amount_paid: 240_000
      },
      { ...base, id: 'd', status: 'DUE', due_date: daysFromNow(10), amount_rent: 100_000 }
    ];
    prismaMock.rentalLease.findFirst.mockResolvedValue({
      id: 'l',
      property: { address: 'a' },
      start_date: new Date(),
      end_date: null,
      rent_amount: 1,
      service_charge_amount: 0,
      status: 'ACTIVE'
    });
    prismaMock.rentalInstallment.findMany.mockImplementation(async (args: any) => {
      const wanted: string[] | undefined = args?.where?.status?.in;
      return installments.filter(i => !wanted || wanted.includes(i.status));
    });
    prismaMock.rentalInstallment.findFirst.mockResolvedValue(null);
    prismaMock.rentalPaymentAllocation.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prismaMock.rentalPayment.findMany.mockResolvedValue([]);
    prismaMock.rentalSecurityDeposit.findUnique.mockResolvedValue(null);
    prismaMock.maintenanceTicket.groupBy.mockResolvedValue([]);

    const out = await service.getDashboard('c', 'l', 't');

    expect(out.currentBalance).toBe(252_000 + 100_000);
    expect(out.overdueInstallmentsCount).toBe(1);
  });
});

describe('liste des échéances — brouillon et annulée (BUG-2026-11-03-006)', () => {
  it('ne transforme jamais un brouillon futur ou une annulée en « Dû »', async () => {
    const rows = [
      { ...base, id: 'draft', status: 'DRAFT', due_date: daysFromNow(200), amount_rent: 100_000 },
      { ...base, id: 'canc', status: 'CANCELED', due_date: daysFromNow(-5), amount_rent: 100_000 },
      { ...base, id: 'due', status: 'DUE', due_date: daysFromNow(5), amount_rent: 100_000 }
    ];
    prismaMock.rentalInstallment.findMany.mockResolvedValue(rows);
    prismaMock.rentalInstallment.count.mockResolvedValue(3);

    const out = await service.getInstallments('c', 'l', 't');
    const byId = Object.fromEntries(out.installments.map((i: any) => [i.id, i.status]));

    expect(byId).toEqual({ draft: 'DRAFT', canc: 'CANCELED', due: 'DUE' });
    expect(out.summary.due).toBe(1);
    expect(out.summary.overdue).toBe(0);
  });
});

describe('identifiants inconnus : 404 (BUG-2026-11-03-007)', () => {
  it("détail d'échéance mal formé", async () => {
    await expect(service.getInstallmentDetails('c', 'l', 't', 'abc')).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.rentalInstallment.findFirst).not.toHaveBeenCalled();
  });

  it("détail d'une échéance inexistante ou d'un autre locataire", async () => {
    prismaMock.rentalInstallment.findFirst.mockResolvedValue(null);
    await expect(service.getInstallmentDetails('c', 'l', 't', UUID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('téléchargement avec un identifiant mal formé', async () => {
    await expect(service.downloadDocument('c', 'l', 't', 'abc')).rejects.toBeInstanceOf(NotFoundError);
  });

  it("déclaration sur l'échéance d'un autre locataire", async () => {
    prismaMock.rentalInstallment.findFirst.mockResolvedValue(null);
    await expect(
      service.declarePayment('c', 'l', 't', {
        amount: 1,
        paymentDate: '2026-10-01',
        paymentMethod: 'CASH',
        installmentId: UUID
      })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.rentalPaymentDeclaration.create).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'CANCELED'])('refuse une déclaration sur une échéance %s', async status => {
    prismaMock.rentalInstallment.findFirst.mockResolvedValue({ id: UUID, status });
    await expect(
      service.declarePayment('c', 'l', 't', {
        amount: 1,
        paymentDate: '2026-10-01',
        paymentMethod: 'CASH',
        installmentId: UUID
      })
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(prismaMock.rentalPaymentDeclaration.create).not.toHaveBeenCalled();
  });
});

describe('historique — motif de rejet (BUG-2026-11-03-008)', () => {
  it('renvoie le motif de la déclaration rejetée, pas celui des autres', async () => {
    prismaMock.rentalPayment.findMany.mockResolvedValue([]);
    prismaMock.rentalPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    const decl = (id: string, status: string, review_notes: string | null) => ({
      id,
      status,
      review_notes,
      amount: 10,
      payment_method: 'CASH',
      reference: null,
      payment_date: new Date()
    });
    prismaMock.rentalPaymentDeclaration.findMany.mockResolvedValue([
      decl('r', 'REJECTED', 'Justificatif illisible'),
      decl('p', 'PENDING', 'note interne')
    ]);

    const out = await service.getPaymentHistory('c', 'l', 't');
    const byId = Object.fromEntries(out.payments.map((p: any) => [p.id, p.rejectionReason]));

    expect(byId).toEqual({ r: 'Justificatif illisible', p: null });
  });
});

describe('historique — filtres des paiements et déclarations (BUG-2026-11-05-009)', () => {
  const payment = (id: string, method: string) => ({
    id,
    amount: 100,
    method,
    status: 'SUCCESS',
    currency: 'FCFA',
    psp_reference: null,
    psp_transaction_id: null,
    succeeded_at: new Date('2026-11-04T12:00:00Z'),
    initiated_at: new Date('2026-11-04T11:00:00Z'),
    allocations: []
  });
  const declaration = (id: string, method: string) => ({
    id,
    amount: 100,
    payment_method: method,
    status: 'PENDING',
    reference: null,
    payment_date: new Date('2026-11-04T12:00:00Z')
  });

  it.each(['BANK_TRANSFER', 'CHECK', 'CASH'])(
    'ne retient que la méthode %s sur paiements et déclarations avant pagination',
    async method => {
      const payments = [payment('payment-bank', 'BANK_TRANSFER'), payment('payment-check', 'CHECK')];
      const declarations = [
        declaration('declaration-cash', 'CASH'),
        declaration('declaration-bank', 'BANK_TRANSFER'),
        declaration('declaration-check', 'CHECK')
      ];
      prismaMock.rentalPayment.findMany.mockImplementation(async ({ where }: any) =>
        payments.filter(row => where.method.in.includes(row.method))
      );
      prismaMock.rentalPaymentDeclaration.findMany.mockImplementation(async ({ where }: any) =>
        declarations.filter(row => where.payment_method.in.includes(row.payment_method))
      );
      prismaMock.rentalPayment.aggregate.mockResolvedValue({ _sum: { amount: 200 } });

      const out = await service.getPaymentHistory('client', 'lease-1', 'tenant', { method }, { page: 1, limit: 1 }, [
        'lease-1',
        'lease-2'
      ]);

      expect(prismaMock.rentalPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            lease_id: { in: ['lease-1', 'lease-2'] },
            tenant_id: 'tenant',
            method: { in: [method] }
          })
        })
      );
      expect(prismaMock.rentalPaymentDeclaration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            lease_id: { in: ['lease-1', 'lease-2'] },
            tenant_id: 'tenant',
            declared_by: 'client',
            payment_method: { in: [method] }
          }
        })
      );
      const expectedTotal = method === 'CASH' ? 1 : 2;
      expect(out.pagination).toEqual({ page: 1, limit: 1, total: expectedTotal, totalPages: expectedTotal });
      expect(out.payments).toHaveLength(1);
      expect(out.payments[0].method).toBe(method);
      expect(out.totalPaid).toBe(200);
    }
  );

  it('combine plusieurs méthodes sans laisser passer les déclarations Espèces', async () => {
    prismaMock.rentalPayment.findMany.mockResolvedValue([]);
    prismaMock.rentalPaymentDeclaration.findMany.mockImplementation(async ({ where }: any) =>
      [
        declaration('declaration-cash', 'CASH'),
        declaration('declaration-bank', 'BANK_TRANSFER'),
        declaration('declaration-check', 'CHECK')
      ].filter(row => where.payment_method.in.includes(row.payment_method))
    );
    prismaMock.rentalPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

    const out = await service.getPaymentHistory('client', 'lease-1', 'tenant', {
      method: ['BANK_TRANSFER', 'CHECK']
    });

    expect(prismaMock.rentalPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ method: { in: ['BANK_TRANSFER', 'CHECK'] } }) })
    );
    expect(out.payments.map((row: any) => row.method).sort()).toEqual(['BANK_TRANSFER', 'CHECK']);
    expect(out.pagination.total).toBe(2);
  });

  it('filtre la journée entière sur la date affichée des deux sources', async () => {
    prismaMock.rentalPayment.findMany.mockResolvedValue([]);
    prismaMock.rentalPaymentDeclaration.findMany.mockResolvedValue([]);
    prismaMock.rentalPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

    await service.getPaymentHistory('client', 'lease-1', 'tenant', {
      startDate: '2026-11-04T00:00:00.000Z',
      endDate: '2026-11-04T23:59:59.999Z'
    });

    const dateRange = { gte: new Date('2026-11-04T00:00:00Z'), lte: new Date('2026-11-04T23:59:59.999Z') };
    expect(prismaMock.rentalPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ succeeded_at: dateRange }, { succeeded_at: null, initiated_at: dateRange }]
        })
      })
    );
    expect(prismaMock.rentalPaymentDeclaration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ payment_date: dateRange, declared_by: 'client', tenant_id: 'tenant' })
      })
    );
  });
});

describe('liste des échéances — cartes de synthèse et Partielle (BUG-2026-11-03-005, suite)', () => {
  it('range chaque échéance dans une carte : partielle échue = retard, partielle à venir = attente', async () => {
    const rows = [
      { ...base, id: 'paid', status: 'PAID', due_date: daysFromNow(-60), amount_rent: 100_000, amount_paid: 100_000 },
      {
        ...base,
        id: 'late-partial',
        status: 'PARTIAL',
        due_date: daysFromNow(-30),
        amount_rent: 480_000,
        penalty_amount: 12_000,
        amount_paid: 240_000
      },
      {
        ...base,
        id: 'soon-partial',
        status: 'PARTIAL',
        due_date: daysFromNow(5),
        amount_rent: 100_000,
        amount_paid: 40_000
      },
      { ...base, id: 'due', status: 'DUE', due_date: daysFromNow(10), amount_rent: 100_000 }
    ];
    prismaMock.rentalInstallment.findMany.mockResolvedValue(rows);
    prismaMock.rentalInstallment.count.mockResolvedValue(4);

    const { summary } = await service.getInstallments('c', 'l', 't');

    expect(summary.overdue).toBe(1);
    expect(summary.due).toBe(2);
    expect(summary.paid).toBe(1);
    expect(summary.paid + summary.due + summary.overdue).toBe(summary.total);
  });
});
