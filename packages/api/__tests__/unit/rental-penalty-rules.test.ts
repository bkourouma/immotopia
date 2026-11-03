/**
 * Règles de calcul des pénalités de retard : taux 0 du bail, justificatif
 * conservé à l'ajustement, bail non actif, absence de doublon.
 */
const mockPrisma: any = {
  rentalInstallment: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  rentalPenalty: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  rentalPenaltyRule: { findFirst: jest.fn(), create: jest.fn() },
  rentalLease: { findFirst: jest.fn() },
  $transaction: jest.fn()
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/lib/audit/changes', () => ({ diffForAudit: jest.fn(() => ({})) }));
jest.mock('../../src/services/rental-installment-service', () => ({
  compteLocataireTx: jest.fn(async () => 'acc-1'),
  libellePeriodeEcheance: jest.fn(() => '2026-09'),
  remettrePenaliteTx: jest.fn(async () => undefined),
  updateInstallmentStatus: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/finance/ledger', () => ({ appendThirdPartyMovementTx: jest.fn(async () => undefined) }));
jest.mock('../../src/utils/project-root', () => ({ getProjectRoot: () => '/tmp' }));
jest.mock('../../src/utils/tenant-context', () => ({
  runWithTenantContext: (_ctx: unknown, fn: () => unknown) => fn()
}));
jest.mock('../../src/i18n', () => ({ t: (s: string) => s }));

import {
  calculatePenalty,
  calculatePenaltiesForOverdueInstallments,
  getDefaultPenaltyRule,
  updatePenalty
} from '../../src/services/rental-penalty-service';

const TENANT = 'tenant-1';
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

function lease(over: Record<string, unknown> = {}) {
  return {
    id: 'lease-1',
    status: 'ACTIVE',
    primary_renter_client_id: 'client-1',
    penalty_grace_days: 0,
    penalty_mode: 'PERCENT_OF_BALANCE',
    penalty_rate: 2,
    penalty_fixed_amount: 0,
    penalty_cap_amount: null,
    ...over
  };
}

function installment(leaseOver: Record<string, unknown> = {}) {
  return {
    id: 'inst-1',
    tenant_id: TENANT,
    lease_id: 'lease-1',
    due_date: daysAgo(30),
    amount_rent: 150000,
    amount_service: 10000,
    amount_other_fees: 0,
    amount_paid: 0,
    currency: 'FCFA',
    period_year: 2026,
    period_month: 9,
    status: 'OVERDUE',
    lease: lease(leaseOver)
  };
}

const agencyRule = {
  grace_days: 0,
  mode: 'PERCENT_OF_BALANCE',
  rate: 2,
  fixed_amount: 0,
  cap_amount: null,
  min_balance_to_apply: null
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  mockPrisma.rentalPenaltyRule.findFirst.mockResolvedValue(agencyRule);
  mockPrisma.rentalPenalty.findFirst.mockResolvedValue(null);
  mockPrisma.rentalPenalty.create.mockImplementation(async ({ data }: any) => ({
    id: 'pen-1',
    calculated_at: new Date(),
    ...data
  }));
  mockPrisma.rentalPenalty.update.mockImplementation(async ({ data }: any) => ({
    id: 'pen-1',
    calculated_at: new Date(),
    ...data
  }));
});

describe('taux de pénalité du bail', () => {
  it('2 % sur 160 000 FCFA donne 3 200 FCFA', async () => {
    mockPrisma.rentalInstallment.findFirst.mockResolvedValue(installment({ penalty_rate: 2 }));
    const p = await calculatePenalty(TENANT, 'inst-1', agencyRule);
    expect(Number(p.amount)).toBe(3200);
  });

  it("un taux 0 explicite sur le bail ne retombe pas sur le défaut de l'agence", async () => {
    mockPrisma.rentalInstallment.findFirst.mockResolvedValue(installment({ penalty_rate: 0 }));
    const p = await calculatePenalty(TENANT, 'inst-1', { ...agencyRule, rate: 0.02 });
    expect(Number(p.amount)).toBe(0);
  });

  it("un montant fixe 0 explicite en mode FIXED_AMOUNT donne 0, pas le fixe de l'agence", async () => {
    mockPrisma.rentalInstallment.findFirst.mockResolvedValue(
      installment({ penalty_mode: 'FIXED_AMOUNT', penalty_fixed_amount: 0 })
    );
    const p = await calculatePenalty(TENANT, 'inst-1', { ...agencyRule, fixed_amount: 5000 });
    expect(Number(p.amount)).toBe(0);
  });

  it("un taux absent (null) prend celui de l'agence, exprimé en pourcentage comme le bail", async () => {
    mockPrisma.rentalInstallment.findFirst.mockResolvedValue(installment({ penalty_rate: null }));
    const p = await calculatePenalty(TENANT, 'inst-1', { ...agencyRule, rate: 2 });
    expect(Number(p.amount)).toBe(3200);
  });

  it('le taux par défaut créé pour une agence est de 2 (%), pas 0,02', async () => {
    mockPrisma.rentalPenaltyRule.findFirst.mockResolvedValue(null);
    mockPrisma.rentalPenaltyRule.create.mockImplementation(async ({ data }: any) => data);
    const rule = await getDefaultPenaltyRule(TENANT);
    expect(Number(rule.rate)).toBe(2);
  });

  it('conserve le montant fixe, le plafond et la grâce', async () => {
    mockPrisma.rentalInstallment.findFirst.mockResolvedValue(
      installment({ penalty_mode: 'FIXED_AMOUNT', penalty_fixed_amount: 7000, penalty_cap_amount: 5000 })
    );
    const p = await calculatePenalty(TENANT, 'inst-1', agencyRule);
    expect(Number(p.amount)).toBe(5000);

    mockPrisma.rentalInstallment.findFirst.mockResolvedValue(installment({ penalty_grace_days: 60 }));
    await expect(calculatePenalty(TENANT, 'inst-1', agencyRule)).rejects.toThrow();
  });
});

describe("justificatif conservé à l'ajustement", () => {
  it('ajuster une pénalité non encore ajustée garde le justificatif joint', async () => {
    const justification = { fileUrl: '/uploads/x.pdf', fileName: 'x.pdf' };
    mockPrisma.rentalPenalty.findFirst.mockResolvedValue({
      id: 'pen-1',
      amount: 3200,
      calculatedAmount: 3200,
      is_manual_override: false,
      override_reason: JSON.stringify({ justification }),
      installment: { lease_id: 'lease-1', period_year: 2026, period_month: 9 },
      installment_id: 'inst-1'
    });
    mockPrisma.rentalLease.findFirst.mockResolvedValue({ primary_renter_client_id: 'client-1' });
    await updatePenalty(TENANT, 'pen-1', 1000, 'Geste', 'user-1');
    const data = mockPrisma.rentalPenalty.update.mock.calls[0][0].data;
    const saved = JSON.parse(data.override_reason);
    expect(saved.justification).toEqual(justification);
    expect(saved.reason).toBe('Geste');
    expect(saved.calculatedAmount).toBe(3200);
  });
});

describe('bail non actif', () => {
  it('le calcul de masse ne retient que les baux actifs', async () => {
    mockPrisma.rentalInstallment.findMany.mockResolvedValue([]);
    await calculatePenaltiesForOverdueInstallments(TENANT);
    const where = mockPrisma.rentalInstallment.findMany.mock.calls[0][0].where;
    expect(where.lease).toEqual({ status: 'ACTIVE' });
  });

  it.each(['DRAFT', 'SUSPENDED', 'ENDED', 'CANCELED'])('calculatePenalty refuse un bail %s', async status => {
    mockPrisma.rentalInstallment.findFirst.mockResolvedValue(installment({ status }));
    await expect(calculatePenalty(TENANT, 'inst-1', agencyRule)).rejects.toThrow();
    expect(mockPrisma.rentalPenalty.create).not.toHaveBeenCalled();
  });
});

describe('pas de doublon', () => {
  it("recalculer une pénalité calculée la met à jour au lieu d'en créer une autre", async () => {
    mockPrisma.rentalInstallment.findFirst.mockResolvedValue(installment());
    mockPrisma.rentalPenalty.findFirst.mockResolvedValue({ id: 'pen-1', is_manual_override: false });
    await calculatePenalty(TENANT, 'inst-1', agencyRule);
    expect(mockPrisma.rentalPenalty.create).not.toHaveBeenCalled();
    expect(mockPrisma.rentalPenalty.update).toHaveBeenCalledTimes(1);
  });

  it('recalculer une pénalité ajustée à la main ne crée pas de seconde pénalité', async () => {
    mockPrisma.rentalInstallment.findFirst.mockResolvedValue(installment());
    mockPrisma.rentalPenalty.findFirst.mockResolvedValue({ id: 'pen-1', amount: 1000, is_manual_override: true });
    await calculatePenalty(TENANT, 'inst-1', agencyRule);
    expect(mockPrisma.rentalPenalty.create).not.toHaveBeenCalled();
    expect(mockPrisma.rentalPenalty.update).not.toHaveBeenCalled();
  });
});
