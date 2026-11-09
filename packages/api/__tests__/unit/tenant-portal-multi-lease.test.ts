/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Recette gestion locative du 04/11/2026 — portail locataire :
 * BUG-049 (plusieurs baux actifs, H29) et BUG-054 (brouillon échu « En retard », H30).
 * Prisma est simulé.
 */
const prismaMock: any = {
  rentalLease: { findFirst: jest.fn(), findMany: jest.fn() },
  rentalInstallment: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  rentalPayment: { findMany: jest.fn(), aggregate: jest.fn() },
  rentalPaymentDeclaration: { findMany: jest.fn(), create: jest.fn() },
  rentalSecurityDeposit: { findUnique: jest.fn() },
  maintenanceTicket: { groupBy: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/lib/payment-gateway/availability', () => ({
  assertRentalOnlinePaymentAllowed: jest.fn(async () => undefined)
}));

jest.mock('../../src/lib/maintenance/portal-visibility', () => ({
  findTenantPortalTicket: jest.fn(),
  resolveTenantPortalCrmContactId: jest.fn(),
  tenantPortalTicketFilter: jest.fn().mockResolvedValue({})
}));
const startCheckoutMock = jest.fn();
jest.mock('../../src/lib/payment-gateway/checkout', () => ({
  getCheckoutForPortal: jest.fn(),
  getOnlinePaymentAvailability: jest.fn(),
  startCheckout: (...a: any[]) => startCheckoutMock(...a),
  toOnlineCheckoutDto: jest.fn()
}));

import { TenantPortalService } from '../../src/services/tenant-portal-service';
import { NotFoundError } from '../../src/middleware/error-middleware';
import { listPortalLeaseIds, resolveRequestedLeaseId } from '../../src/utils/tenant-portal-leases';
import { startOnlinePaymentHandler } from '../../src/controllers/tenant-portal-online-payment-controller';

const service = new TenantPortalService();
const L1 = '00000000-0000-4000-8000-000000000001';
const L2 = '00000000-0000-4000-8000-000000000002';
const L_OTHER = '00000000-0000-4000-8000-0000000000ff';
const I_OTHER = '00000000-0000-4000-8000-0000000000fe';
const I_L2 = '00000000-0000-4000-8000-000000000012';

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

describe('périmètre de baux du locataire (BUG-2026-11-04-049)', () => {
  it('liste les baux actifs du seul client connecté, filtrés par agence', async () => {
    prismaMock.rentalLease.findMany.mockResolvedValue([{ id: L1 }, { id: L2 }]);
    expect(await listPortalLeaseIds('agence', 'client')).toEqual([L1, L2]);
    const where = prismaMock.rentalLease.findMany.mock.calls[0][0].where;
    expect(where.tenant_id).toBe('agence');
    expect(where.status).toBe('ACTIVE');
    expect(JSON.stringify(where.OR)).toContain('client');
  });

  it('un leaseId forgé (autre locataire ou mal formé) répond 404', () => {
    expect(() => resolveRequestedLeaseId([L1, L2], L_OTHER, L1)).toThrow(NotFoundError);
    expect(() => resolveRequestedLeaseId([L1, L2], 'abc', L1)).toThrow(NotFoundError);
    expect(resolveRequestedLeaseId([L1, L2], L2, L1)).toEqual({ leaseId: L2, explicit: true });
    expect(resolveRequestedLeaseId([L1, L2], undefined, L1)).toEqual({ leaseId: L1, explicit: false });
  });

  it('accueil : cumule le solde et les retards de tous les baux et résume chaque bail', async () => {
    prismaMock.rentalLease.findFirst.mockResolvedValue({
      id: L1,
      property: { address: 'a' },
      start_date: new Date(),
      end_date: null,
      rent_amount: 1,
      service_charge_amount: 0,
      status: 'ACTIVE'
    });
    prismaMock.rentalLease.findMany.mockResolvedValue([
      { id: L1, lease_number: 'BAIL-1', property: { address: 'a', title: null } },
      { id: L2, lease_number: 'BAIL-2', property: { address: 'b', title: null } }
    ]);
    prismaMock.rentalInstallment.findMany.mockResolvedValue([
      { ...base, id: 'i1', lease_id: L1, status: 'DUE', due_date: daysFromNow(-3), amount_rent: 100_000 },
      { ...base, id: 'i2', lease_id: L2, status: 'DUE', due_date: daysFromNow(10), amount_rent: 50_000 }
    ]);
    prismaMock.rentalInstallment.findFirst.mockResolvedValue(null);
    prismaMock.rentalPayment.findMany.mockResolvedValue([]);
    prismaMock.rentalSecurityDeposit.findUnique.mockResolvedValue(null);
    prismaMock.maintenanceTicket.groupBy.mockResolvedValue([]);

    const out = await service.getDashboard('c', L1, 't', [L1, L2]);

    expect(out.currentBalance).toBe(150_000);
    expect(out.overdueInstallmentsCount).toBe(1);
    expect(out.leases?.map(l => [l.leaseNumber, l.balance])).toEqual([
      ['BAIL-1', 100_000],
      ['BAIL-2', 50_000]
    ]);
    expect(prismaMock.rentalInstallment.findMany.mock.calls[0][0].where.lease_id).toEqual({ in: [L1, L2] });
  });

  it('liste des échéances : tous les baux, avec le numéro de bail', async () => {
    prismaMock.rentalInstallment.findMany.mockResolvedValue([
      {
        ...base,
        id: 'i1',
        lease_id: L1,
        lease: { lease_number: 'BAIL-1' },
        status: 'DUE',
        due_date: daysFromNow(5),
        amount_rent: 1
      },
      {
        ...base,
        id: 'i2',
        lease_id: L2,
        lease: { lease_number: 'BAIL-2' },
        status: 'DUE',
        due_date: daysFromNow(6),
        amount_rent: 1
      }
    ]);
    prismaMock.rentalInstallment.count.mockResolvedValue(2);

    const out = await service.getInstallments('c', L1, 't', undefined, undefined, [L1, L2]);

    expect(out.installments.map((i: any) => [i.leaseId, i.leaseNumber])).toEqual([
      [L1, 'BAIL-1'],
      [L2, 'BAIL-2']
    ]);
    expect(prismaMock.rentalInstallment.findMany.mock.calls[0][0].where.lease_id).toEqual({ in: [L1, L2] });
  });

  it("détail d'une échéance d'un autre locataire : 404, requête bornée aux baux du locataire", async () => {
    prismaMock.rentalInstallment.findFirst.mockResolvedValue(null);
    await expect(service.getInstallmentDetails('c', L1, 't', I_OTHER, [L1, L2])).rejects.toBeInstanceOf(NotFoundError);
    const where = prismaMock.rentalInstallment.findFirst.mock.calls[0][0].where;
    expect(where.lease_id).toEqual({ in: [L1, L2] });
    expect(where.tenant_id).toBe('t');
  });

  it("déclaration sur l'échéance d'un autre locataire : 404 ; sur le 2e bail : déclarée sur CE bail", async () => {
    prismaMock.rentalInstallment.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.declarePayment(
        'c',
        L1,
        't',
        { amount: 1, paymentDate: '2026-10-01', paymentMethod: 'CASH', installmentId: I_OTHER },
        undefined,
        [L1, L2]
      )
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.rentalPaymentDeclaration.create).not.toHaveBeenCalled();

    prismaMock.rentalInstallment.findFirst.mockResolvedValueOnce({
      id: I_L2,
      lease_id: L2,
      status: 'DUE',
      due_date: daysFromNow(-1)
    });
    prismaMock.rentalPaymentDeclaration.create.mockRejectedValueOnce(new Error('stop'));
    await expect(
      service.declarePayment(
        'c',
        L1,
        't',
        { amount: 1, paymentDate: '2026-10-01', paymentMethod: 'CASH', installmentId: I_L2 },
        undefined,
        [L1, L2]
      )
    ).rejects.toThrow('stop');
    expect(prismaMock.rentalPaymentDeclaration.create.mock.calls[0][0].data.lease_id).toBe(L2);
  });

  it('paiement en ligne : échéance forgée → 404, jamais startCheckout', async () => {
    prismaMock.rentalLease.findMany.mockResolvedValue([{ id: L1 }, { id: L2 }]);
    prismaMock.rentalInstallment.findMany.mockResolvedValue([]);
    const next = jest.fn();
    const res: any = { status: jest.fn(() => res), json: jest.fn(() => res) };
    const req: any = {
      tenantPortal: { tenantId: 't', tenantClientId: 'c', leaseId: L1 },
      user: { userId: 'u' },
      body: { installmentIds: [I_OTHER] }
    };
    await (startOnlinePaymentHandler as any)(req, res, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
    expect(startCheckoutMock).not.toHaveBeenCalled();
  });

  it('paiement en ligne : le bail du paiement est celui de l’échéance (2e bail)', async () => {
    prismaMock.rentalLease.findMany.mockResolvedValue([{ id: L1 }, { id: L2 }]);
    prismaMock.rentalInstallment.findMany.mockResolvedValue([{ id: I_L2, lease_id: L2 }]);
    startCheckoutMock.mockResolvedValue({ codePaiement: 'x' });
    const res: any = { status: jest.fn(() => res), json: jest.fn(() => res) };
    const req: any = {
      tenantPortal: { tenantId: 't', tenantClientId: 'c', leaseId: L1 },
      user: { userId: 'u' },
      body: { installmentIds: [I_L2] }
    };
    await (startOnlinePaymentHandler as any)(req, res, jest.fn());
    expect(startCheckoutMock).toHaveBeenCalledWith('t', 'c', L2, [I_L2], 'u');
  });
});

describe('brouillon échu affiché « En retard » (BUG-2026-11-04-054)', () => {
  it('liste : brouillon échu → OVERDUE et compté en retard ; brouillon futur → DRAFT', async () => {
    prismaMock.rentalInstallment.findMany.mockResolvedValue([
      { ...base, id: 'old', lease_id: L1, status: 'DRAFT', due_date: daysFromNow(-20), amount_rent: 100_000 },
      { ...base, id: 'future', lease_id: L1, status: 'DRAFT', due_date: daysFromNow(60), amount_rent: 100_000 }
    ]);
    prismaMock.rentalInstallment.count.mockResolvedValue(2);

    const out = await service.getInstallments('c', L1, 't');
    const byId = Object.fromEntries(out.installments.map((i: any) => [i.id, i.status]));

    expect(byId).toEqual({ old: 'OVERDUE', future: 'DRAFT' });
    expect(out.summary.overdue).toBe(1);
    expect(out.summary.total).toBe(1);
  });

  it('accueil : la requête inclut les brouillons échus', async () => {
    prismaMock.rentalLease.findFirst.mockResolvedValue({
      id: L1,
      property: { address: 'a' },
      start_date: new Date(),
      end_date: null,
      rent_amount: 1,
      service_charge_amount: 0,
      status: 'ACTIVE'
    });
    prismaMock.rentalInstallment.findMany.mockResolvedValue([
      { ...base, id: 'old', lease_id: L1, status: 'DRAFT', due_date: daysFromNow(-20), amount_rent: 100_000 }
    ]);
    prismaMock.rentalInstallment.findFirst.mockResolvedValue(null);
    prismaMock.rentalPayment.findMany.mockResolvedValue([]);
    prismaMock.rentalSecurityDeposit.findUnique.mockResolvedValue(null);
    prismaMock.maintenanceTicket.groupBy.mockResolvedValue([]);

    const out = await service.getDashboard('c', L1, 't');

    expect(out.overdueInstallmentsCount).toBe(1);
    expect(JSON.stringify(prismaMock.rentalInstallment.findMany.mock.calls[0][0].where)).toContain('DRAFT');
  });

  it('déclaration sur un brouillon échu acceptée ; sur un brouillon futur refusée', async () => {
    prismaMock.rentalPaymentDeclaration.create.mockRejectedValue(new Error('stop'));
    prismaMock.rentalInstallment.findFirst.mockResolvedValueOnce({
      id: I_L2,
      lease_id: L1,
      status: 'DRAFT',
      due_date: daysFromNow(-5)
    });
    await expect(
      service.declarePayment('c', L1, 't', {
        amount: 1,
        paymentDate: '2026-10-01',
        paymentMethod: 'CASH',
        installmentId: I_L2
      })
    ).rejects.toThrow('stop');

    prismaMock.rentalInstallment.findFirst.mockResolvedValueOnce({
      id: I_L2,
      lease_id: L1,
      status: 'DRAFT',
      due_date: daysFromNow(30)
    });
    await expect(
      service.declarePayment('c', L1, 't', {
        amount: 1,
        paymentDate: '2026-10-01',
        paymentMethod: 'CASH',
        installmentId: I_L2
      })
    ).rejects.toThrow(/exigible/);
  });
});

describe('GET /portal/tenant/lease : select explicite (D26)', () => {
  const FORBIDDEN_KEYS = [
    'terms_json',
    'notes',
    'created_by_user_id',
    'crm_deal_id',
    'signature_request_id',
    'owner_client_id',
    'property_id',
    'userId'
  ];

  function collectKeys(node: any, keys: Set<string> = new Set()): Set<string> {
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        keys.add(key);
        collectKeys(value, keys);
      }
    }
    return keys;
  }

  it('la requête Prisma ne sélectionne ni champ interne ni userId, et la réponse non plus', async () => {
    prismaMock.rentalLease.findFirst.mockResolvedValue({
      id: L1,
      lease_number: 'BAIL-1',
      status: 'ACTIVE',
      property: { internalReference: 'P', address: 'a', title: null, owner: null, containerParent: null },
      primaryRenter: { user: { fullName: 'A', email: 'a@x.test' } },
      ownerClient: null
    });
    prismaMock.rentalLeaseCoRenter = { findMany: jest.fn().mockResolvedValue([]) };
    prismaMock.rentalDocument = { findMany: jest.fn().mockResolvedValue([]) };

    const out = await service.getLeaseDetails('c', L1, 't');

    const args = prismaMock.rentalLease.findFirst.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    expect(args.select).toBeDefined();
    const requested = collectKeys(args.select);
    for (const key of FORBIDDEN_KEYS) expect(requested.has(key)).toBe(false);
    const coArgs = prismaMock.rentalLeaseCoRenter.findMany.mock.calls[0][0];
    expect(coArgs.include).toBeUndefined();
    for (const key of FORBIDDEN_KEYS) expect(collectKeys(coArgs.select).has(key)).toBe(false);
    const returned = collectKeys(out);
    for (const key of FORBIDDEN_KEYS) expect(returned.has(key)).toBe(false);
  });
});
