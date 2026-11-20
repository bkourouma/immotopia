/**
 * Revue fonctionnelle gestion locative (lot 3, territoire C) : gardes et
 * arrondis du calcul d'une pénalité.
 *
 * - une échéance annulée ou soldée ne reçoit aucune pénalité (le montant fixe
 *   en créait une, et un débit au compte du locataire, sur une pièce sans dette) ;
 * - le franc CFA se facture à l'unité (jamais 3266,66 FCFA), les autres
 *   devises au centime.
 */

type Row = Record<string, any>;

const store = { installments: [] as Row[], penalties: [] as Row[], seq: 0 };

const LEASE = {
  id: 'lease-1',
  status: 'ACTIVE',
  primary_renter_client_id: 'client-1',
  penalty_grace_days: 0,
  penalty_mode: 'PERCENT_OF_BALANCE',
  penalty_rate: 2,
  penalty_fixed_amount: 0,
  penalty_cap_amount: null
};

const mockPrisma: Row = {
  rentalInstallment: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const found = store.installments.find(i => i.id === where.id && i.tenant_id === where.tenant_id);
      return found ? { ...found, lease: LEASE } : null;
    }),
    update: jest.fn(async () => ({}))
  },
  rentalPenalty: {
    findFirst: jest.fn(async () => null),
    create: jest.fn(async ({ data }: Row) => {
      const row = { id: `pen-${++store.seq}`, ...data };
      store.penalties.push(row);
      return row;
    }),
    update: jest.fn()
  },
  $queryRaw: jest.fn(async () => []),
  $transaction: jest.fn(async (cb: (tx: Row) => Promise<any>) => cb(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/rental-installment-service', () => ({
  compteLocataireTx: jest.fn(async () => 'acc-1'),
  libellePeriodeEcheance: jest.fn(() => '09/2026'),
  remettrePenaliteTx: jest.fn(async () => undefined),
  updateInstallmentStatus: jest.fn(async () => undefined)
}));

import { calculatePenalty } from '../../src/services/rental-penalty-service';
import { isWholeUnitCurrency, roundForCurrency } from '../../src/lib/finance/currency-rounding';

const TENANT = 'tenant-A';

function seed(overrides: Row = {}): void {
  const due = new Date();
  due.setDate(due.getDate() - 20);
  store.installments.push({
    id: 'inst-1',
    tenant_id: TENANT,
    lease_id: 'lease-1',
    due_date: due,
    period_year: 2026,
    period_month: 9,
    status: 'OVERDUE',
    amount_rent: 160000,
    amount_service: 0,
    amount_other_fees: 0,
    amount_paid: 0,
    currency: 'FCFA',
    ...overrides
  });
}

const rule = {
  grace_days: 0,
  mode: 'PERCENT_OF_BALANCE',
  rate: 2,
  fixed_amount: 0,
  cap_amount: null,
  min_balance_to_apply: null
};

beforeEach(() => {
  store.installments = [];
  store.penalties = [];
  store.seq = 0;
  mockPrisma.rentalPenalty.create.mockClear();
});

describe('calculatePenalty : gardes de statut', () => {
  it('refuse une échéance annulée, sans créer de pénalité', async () => {
    seed({ status: 'CANCELED' });
    await expect(calculatePenalty(TENANT, 'inst-1', rule)).rejects.toThrow('annulée');
    expect(mockPrisma.rentalPenalty.create).not.toHaveBeenCalled();
  });

  it('refuse une échéance entièrement payée, même en montant fixe', async () => {
    seed({ status: 'PAID', amount_paid: 160000 });
    await expect(
      calculatePenalty(TENANT, 'inst-1', { ...rule, mode: 'FIXED_AMOUNT', fixed_amount: 5000 })
    ).rejects.toThrow('entièrement payée');
    expect(mockPrisma.rentalPenalty.create).not.toHaveBeenCalled();
  });

  it('une échéance en retard calcule normalement', async () => {
    seed();
    const pen = await calculatePenalty(TENANT, 'inst-1', rule);
    expect(pen.amount).toBe(3200);
  });
});

describe('calculatePenalty : solde négatif', () => {
  it('un règlement qui entame déjà la pénalité (161 000 payés sur 160 000 de loyer) ne crée pas de pénalité négative', async () => {
    seed({ status: 'PARTIAL', amount_paid: 161000, penalty_amount: 3200 });
    const pen = await calculatePenalty(TENANT, 'inst-1', rule);
    expect(pen.amount).toBe(0);
  });
});

describe('calculatePenalty : arrondi par devise', () => {
  it('franc CFA : 2 % de 163 333 = 3 267 (pas 3 266,66)', async () => {
    seed({ amount_rent: 163333 });
    const pen = await calculatePenalty(TENANT, 'inst-1', rule);
    expect(pen.amount).toBe(3267);
    expect(Number.isInteger(pen.calculatedAmount)).toBe(true);
  });

  it('devise à deux décimales : arrondi au centime', async () => {
    seed({ amount_rent: 1234.57, currency: 'EUR' });
    const pen = await calculatePenalty(TENANT, 'inst-1', rule);
    expect(pen.amount).toBe(24.69);
  });

  it('roundForCurrency : demie vers le haut en FCFA, devise absente = FCFA, 10 devises entières', () => {
    expect(roundForCurrency(10.5, 'FCFA')).toBe(11);
    expect(roundForCurrency(10.4, undefined)).toBe(10);
    expect(roundForCurrency(10.456, 'USD')).toBe(10.46);
    for (const currency of ['XOF', 'XAF', 'FCFA', 'CFA', 'XPF', 'GNF', 'KMF', 'DJF', 'BIF', 'RWF']) {
      expect(isWholeUnitCurrency(currency)).toBe(true);
      expect(roundForCurrency(10.5, currency)).toBe(11);
    }
  });
});
