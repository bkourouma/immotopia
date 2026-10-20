/**
 * Montant calculé d'une pénalité (colonne `calculatedAmount`) : écrit au calcul,
 * jamais écrasé par un ajustement manuel, renvoyé par l'API pour toute pénalité.
 */

type Row = Record<string, any>;

const store = { installments: [] as Row[], penalties: [] as Row[], seq: 0 };

const LEASE = {
  id: 'lease-1',
  primary_renter_client_id: 'client-1',
  penalty_grace_days: 0,
  penalty_mode: 'PERCENT_OF_RENT',
  penalty_rate: 10,
  penalty_fixed_amount: null,
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
    findFirst: jest.fn(async ({ where }: Row) => {
      const rows = store.penalties.filter(
        p =>
          p.tenant_id === where.tenant_id &&
          (!where.id || p.id === where.id) &&
          (!where.installment_id || p.installment_id === where.installment_id)
      );
      const row = rows[rows.length - 1];
      return row ? { ...row, installment: store.installments.find(i => i.id === row.installment_id) } : null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      const row = { id: `pen-${++store.seq}`, ...data };
      store.penalties.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.penalties.find(p => p.id === where.id)!;
      for (const [k, v] of Object.entries(data)) if (v !== undefined) row[k] = v;
      return row;
    })
  },
  rentalLease: { findFirst: jest.fn(async () => ({ primary_renter_client_id: 'client-1' })) },
  $transaction: jest.fn(async (cb: (tx: Row) => Promise<any>) => cb(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));
jest.mock('../../src/lib/finance/ledger', () => ({ appendThirdPartyMovementTx: jest.fn(async () => ({ id: 'mv' })) }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/rental-installment-service', () => ({
  compteLocataireTx: jest.fn(async () => 'acc-1'),
  libellePeriodeEcheance: jest.fn(() => '09/2026'),
  remettrePenaliteTx: jest.fn(async () => undefined),
  updateInstallmentStatus: jest.fn(async () => undefined)
}));

import { calculatePenalty, presenterPenalite, updatePenalty } from '../../src/services/rental-penalty-service';

const TENANT = 'tenant-A';

function seedInstallment(): Row {
  const due = new Date();
  due.setDate(due.getDate() - 20);
  const row = {
    id: 'inst-1',
    tenant_id: TENANT,
    lease_id: 'lease-1',
    due_date: due,
    period_year: 2026,
    period_month: 9,
    amount_rent: 80000,
    amount_service: 0,
    amount_other_fees: 0,
    amount_paid: 0,
    currency: 'XOF'
  };
  store.installments.push(row);
  return row;
}

const rule = {
  grace_days: 0,
  mode: 'PERCENT_OF_RENT',
  rate: 10,
  fixed_amount: 0,
  cap_amount: null,
  min_balance_to_apply: null
};

beforeEach(() => {
  store.installments = [];
  store.penalties = [];
  store.seq = 0;
});

describe('calculatePenalty écrit calculatedAmount', () => {
  it('à la création : calculatedAmount = amount calculé', async () => {
    seedInstallment();
    const pen = await calculatePenalty(TENANT, 'inst-1', rule);
    expect(pen.amount).toBe(8000);
    expect(pen.calculatedAmount).toBe(8000);
  });

  it('à la mise à jour (non manuelle) : calculatedAmount suit le nouveau calcul', async () => {
    const inst = seedInstallment();
    await calculatePenalty(TENANT, 'inst-1', rule);
    inst.amount_rent = 100000;
    const pen = await calculatePenalty(TENANT, 'inst-1', rule);
    expect(pen.amount).toBe(10000);
    expect(pen.calculatedAmount).toBe(10000);
  });
});

describe('updatePenalty conserve le montant calculé', () => {
  it("n'écrit pas calculatedAmount quand il existe ; l'API renvoie le calculé et le retenu", async () => {
    seedInstallment();
    await calculatePenalty(TENANT, 'inst-1', rule);
    const out = await updatePenalty(TENANT, 'pen-1', 3000, 'Geste commercial', 'user-1');

    const data = mockPrisma.rentalPenalty.update.mock.calls.at(-1)[0].data;
    expect(data.calculatedAmount).toBeUndefined();
    expect(Number(out.amount)).toBe(3000);
    expect(out.calculated_amount).toBe(8000);
    expect(out.adjusted_amount).toBe(3000);
    expect(out.adjustment_reason).toBe('Geste commercial');

    // Second ajustement : le calculé d'origine survit encore.
    const out2 = await updatePenalty(TENANT, 'pen-1', 1000, 'Nouveau geste', 'user-1');
    expect(out2.calculated_amount).toBe(8000);
    expect(out2.adjusted_amount).toBe(1000);
  });

  it('renseigne calculatedAmount depuis le montant courant quand la colonne est nulle (ancienne pénalité)', async () => {
    seedInstallment();
    store.penalties.push({
      id: 'pen-old',
      tenant_id: TENANT,
      installment_id: 'inst-1',
      amount: 6000,
      calculatedAmount: null,
      is_manual_override: false,
      override_reason: null,
      calculated_at: new Date()
    });
    const out = await updatePenalty(TENANT, 'pen-old', 2000, 'Remise partielle', 'user-1');
    const data = mockPrisma.rentalPenalty.update.mock.calls.at(-1)[0].data;
    expect(data.calculatedAmount).toBe(6000);
    expect(out.calculated_amount).toBe(6000);
  });

  it('conserve le justificatif déjà joint dans override_reason', async () => {
    seedInstallment();
    store.penalties.push({
      id: 'pen-j',
      tenant_id: TENANT,
      installment_id: 'inst-1',
      amount: 4000,
      calculatedAmount: 8000,
      is_manual_override: true,
      override_reason: JSON.stringify({ reason: 'Avant', calculatedAmount: 8000, justificationUrl: '/uploads/j.pdf' }),
      calculated_at: new Date()
    });
    await updatePenalty(TENANT, 'pen-j', 1000, 'Après', 'user-1');
    const data = mockPrisma.rentalPenalty.update.mock.calls.at(-1)[0].data;
    expect(JSON.parse(data.override_reason)).toMatchObject({ reason: 'Après', justificationUrl: '/uploads/j.pdf' });
  });
});

describe('presenterPenalite avec la colonne calculatedAmount', () => {
  it('renvoie le calculé pour une pénalité non ajustée', () => {
    const out = presenterPenalite({
      amount: 8000,
      calculatedAmount: '8000',
      is_manual_override: false,
      override_reason: null
    });
    expect(out.calculated_amount).toBe(8000);
    expect(out.adjusted_amount).toBeNull();
    expect(out.adjustment_reason).toBeNull();
  });

  it("le JSON d'ajustement prime sur la colonne pour une pénalité ajustée (colonne remplie par la migration avec le montant ajusté)", () => {
    const out = presenterPenalite({
      amount: 3000,
      calculatedAmount: 3000,
      is_manual_override: true,
      override_reason: JSON.stringify({ reason: 'Geste', calculatedAmount: 7000 })
    });
    expect(out.calculated_amount).toBe(7000);
    expect(out.adjusted_amount).toBe(3000);
  });

  it('utilise la colonne pour une pénalité ajustée sans montant dans le JSON', () => {
    const out = presenterPenalite({
      amount: 3000,
      calculatedAmount: 8000,
      is_manual_override: true,
      override_reason: JSON.stringify({ reason: 'Geste' })
    });
    expect(out.calculated_amount).toBe(8000);
    expect(out.adjusted_amount).toBe(3000);
  });

  it('retombe sur le JSON quand la colonne est nulle', () => {
    const out = presenterPenalite({
      amount: 3000,
      calculatedAmount: null,
      is_manual_override: true,
      override_reason: JSON.stringify({ reason: 'Geste', calculatedAmount: 7000 })
    });
    expect(out.calculated_amount).toBe(7000);
  });
});
