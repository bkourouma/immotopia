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
