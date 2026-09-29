/**
 * Tests de la campagne de facturation mensuelle (`lib/finance/billing-run.ts`).
 *
 * Prisma est remplacé par un magasin en mémoire (même esprit que
 * `syndics.owner-accounts.ledger.test.ts`) : aucune base n'est requise. Le
 * grand livre (`lib/finance/ledger.ts`) est mocké séparément — ce fichier ne
 * teste pas son calcul de solde, seulement la façon dont la campagne
 * l'orchestre (idempotence, exclusions motivées, avances plus ancien
 * d'abord, atomicité).
 *
 * `buildInstallmentForPeriod` (`installment-builder.ts`), lui, n'est PAS
 * mocké : c'est une fonction pure déjà livrée, et la caractériser deux fois
 * (ici et dans son propre fichier de test) n'apporterait rien.
 */

import { RentalLeaseStatus, RentalBillingFrequency, RentalPaymentStatus, RentBillingRunStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Grand livre — mocké : ce fichier vérifie comment la campagne l'appelle,
// pas ce qu'il calcule.
// ---------------------------------------------------------------------------

const appendThirdPartyMovementTx = jest.fn();
const getOrCreateTenantAccountTx = jest.fn();

jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: (...args: any[]) => appendThirdPartyMovementTx(...args),
  getOrCreateTenantAccountTx: (...args: any[]) => getOrCreateTenantAccountTx(...args)
}));

// ---------------------------------------------------------------------------
// Magasin en mémoire pour `../../src/utils/database`
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

const store = {
  leases: [] as Row[],
  billingRuns: [] as Row[],
  installments: [] as Row[],
  payments: [] as Row[],
  allocations: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function uniqueConstraintError(target: string[]): any {
  return Object.assign(new Error(`Unique constraint failed on the fields: (\`${target.join(', ')}\`)`), {
    code: 'P2002',
    meta: { target }
  });
}

/**
 * Le code de production stocke les montants en `Decimal` (`@prisma/client/runtime/library`),
 * une vraie base les rangerait dans une colonne numerique. Le magasin en
 * memoire, lui, doit rester du JSON clonable (`structuredClone`, utilise par
 * le `$transaction` mocke ci-dessous) : on convertit donc les `Decimal` en
 * `number` a l'ecriture, comme le ferait une vraie base au retour de lecture.
 */
function toPlainRow(data: Row): Row {
  const plain: Row = {};
  for (const [key, value] of Object.entries(data)) {
    plain[key] =
      value !== null && typeof value === 'object' && typeof value.toNumber === 'function' ? Number(value) : value;
  }
  return plain;
}

const mockPrisma: Row = {
  rentalLease: {
    findMany: jest.fn(async ({ where }: Row) => store.leases.filter(l => l.tenant_id === where.tenant_id))
  },

  rentBillingRun: {
    findUnique: jest.fn(async ({ where }: Row) => {
      const key = where.tenantId_periodYear_periodMonth;
      return (
        store.billingRuns.find(
          r => r.tenantId === key.tenantId && r.periodYear === key.periodYear && r.periodMonth === key.periodMonth
        ) ?? null
      );
    }),
    create: jest.fn(async ({ data }: Row) => {
      const clash = store.billingRuns.find(
        r => r.tenantId === data.tenantId && r.periodYear === data.periodYear && r.periodMonth === data.periodMonth
      );
      if (clash) {
        throw uniqueConstraintError(['tenant_id', 'period_year', 'period_month']);
      }
      const created = { id: nextId('run'), finishedAt: null, summary: null, ...data };
      store.billingRuns.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const run = store.billingRuns.find(r => r.id === where.id);
      if (!run) return null;
      Object.assign(run, data);
      return { ...run };
    })
  },

  rentalInstallment: {
    create: jest.fn(async ({ data }: Row) => {
      const clash = store.installments.find(
        i => i.lease_id === data.lease_id && i.period_year === data.period_year && i.period_month === data.period_month
      );
      if (clash) {
        throw uniqueConstraintError(['lease_id', 'period_year', 'period_month']);
      }
      const created = { id: nextId('inst'), amount_paid: 0, status: 'DRAFT', ...toPlainRow(data) };
      store.installments.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const installment = store.installments.find(i => i.id === where.id);
      if (!installment) return null;
      Object.assign(installment, toPlainRow(data));
      return { ...installment };
    })
  },

  rentalPayment: {
    findMany: jest.fn(async ({ where }: Row) => {
      const rows = store.payments.filter(
        p =>
          p.tenant_id === where.tenant_id && p.renter_client_id === where.renter_client_id && p.status === where.status
      );
      const sorted = [...rows].sort((a, b) => {
        const da = (a.succeeded_at ?? a.initiated_at).getTime();
        const db = (b.succeeded_at ?? b.initiated_at).getTime();
        return da - db;
      });
      return sorted.map(p => ({
        id: p.id,
        amount: p.amount,
        allocations: store.allocations.filter(a => a.payment_id === p.id).map(a => ({ amount: a.amount })),
        depositMovements: p.depositCollected ? [{ amount: p.depositCollected }] : []
      }));
    })
  },

  rentalPaymentAllocation: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('alloc'), ...toPlainRow(data) };
      store.allocations.push(created);
      return created;
    })
  },

  $transaction: jest.fn(async (callback: (tx: Row) => Promise<any>) => {
    // Copie profonde pour un vrai rollback : `structuredClone` preserve les
    // `Date`, contrairement a un aller-retour JSON (qui les changerait en
    // chaines de caracteres).
    const snapshot = {
      leases: structuredClone(store.leases),
      billingRuns: structuredClone(store.billingRuns),
      installments: structuredClone(store.installments),
      payments: structuredClone(store.payments),
      allocations: structuredClone(store.allocations),
      seq: store.seq
    };
    try {
      return await callback(mockPrisma);
    } catch (error) {
      store.leases = snapshot.leases;
      store.billingRuns = snapshot.billingRuns;
      store.installments = snapshot.installments;
      store.payments = snapshot.payments;
      store.allocations = snapshot.allocations;
      store.seq = snapshot.seq;
      throw error;
    }
  })
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, prop) {
        return (mockPrisma as any)[prop];
      }
    }
  )
}));

import { runRentBilling } from '../../src/lib/finance/billing-run';

const TENANT_ID = 'tenant-1';
const ACTOR_ID = 'user-1';

function seedLease(overrides: Partial<Row> = {}): Row {
  const lease = {
    id: nextId('lease'),
    tenant_id: TENANT_ID,
    status: RentalLeaseStatus.ACTIVE,
    primary_renter_client_id: nextId('client'),
    start_date: new Date('2026-01-01T00:00:00.000Z'),
    end_date: null,
    billing_frequency: RentalBillingFrequency.MONTHLY,
    due_day_of_month: 5,
    currency: 'FCFA',
    rent_amount: 100000,
    service_charge_amount: 0,
    // Le compte rendu nomme chaque ligne. Sans ces deux relations, la campagne
    // se rabattrait sur l'identifiant abrege et le test ne verifierait rien de
    // ce que la gestionnaire lit reellement.
    property: { title: 'Villa Kipé 12' },
    primaryRenter: { user: { fullName: 'Fatoumata Diallo', email: 'f.diallo@example.ci' } },
    ...overrides
  };
  store.leases.push(lease);
  return lease;
}

function seedPayment(overrides: Partial<Row> = {}): Row {
  const payment = {
    id: nextId('pay'),
    tenant_id: TENANT_ID,
    renter_client_id: overrides.renter_client_id,
    status: RentalPaymentStatus.SUCCESS,
    amount: 0,
    succeeded_at: new Date('2026-01-01T00:00:00.000Z'),
    initiated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides
  };
  store.payments.push(payment);
  return payment;
}

function defaultAccount(tenantClientId: string) {
  return { id: `acc-${tenantClientId}`, label: 'Compte locataire', balance: 0 };
}

beforeEach(() => {
  jest.clearAllMocks();
  store.leases = [];
  store.billingRuns = [];
  store.installments = [];
  store.payments = [];
  store.allocations = [];
  store.seq = 0;

  getOrCreateTenantAccountTx.mockImplementation(async (_tx: any, _tenantId: string, tenantClientId: string) =>
    defaultAccount(tenantClientId)
  );
  appendThirdPartyMovementTx.mockImplementation(async () => ({ id: nextId('mv') }));
});

describe('runRentBilling — campagne nominale', () => {
  it('facture chaque bail actif eligible et consigne le montant dans le compte rendu', async () => {
    const leaseA = seedLease({ rent_amount: 100000, service_charge_amount: 5000 });
    const leaseB = seedLease({ rent_amount: 80000 });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 9 }, ACTOR_ID);

    expect(result.status).toBe('DONE');
    expect(result.label).toBe('Loyer de septembre 2026');
    expect(result.summary?.billed).toEqual(
      expect.arrayContaining([
        {
          leaseId: leaseA.id,
          leaseLabel: 'Fatoumata Diallo — Villa Kipé 12',
          installmentId: expect.any(String),
          amount: 105000
        },
        {
          leaseId: leaseB.id,
          leaseLabel: 'Fatoumata Diallo — Villa Kipé 12',
          installmentId: expect.any(String),
          amount: 80000
        }
      ])
    );
    expect(result.summary?.excluded).toEqual([]);
    expect(store.installments).toHaveLength(2);
    expect(appendThirdPartyMovementTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'INSTALLMENT', billed: 105000, label: 'Loyer de septembre 2026' })
    );
  });

  it('cree une seule campagne par periode, retrouvable par son libelle', async () => {
    seedLease();

    const result = await runRentBilling(
      TENANT_ID,
      { periodYear: 2026, periodMonth: 9, label: 'Loyer special' },
      ACTOR_ID
    );

    expect(store.billingRuns).toHaveLength(1);
    expect(result.label).toBe('Loyer special');
    expect(result.periodYear).toBe(2026);
    expect(result.periodMonth).toBe(9);
  });
});

describe('runRentBilling — idempotence', () => {
  it('relancer la meme periode ne duplique aucune echeance et exclut uniquement pour INSTALLMENT_ALREADY_EXISTS', async () => {
    const lease = seedLease();

    const first = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 9 }, ACTOR_ID);
    const second = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 9 }, ACTOR_ID);

    expect(store.installments).toHaveLength(1);
    expect(store.billingRuns).toHaveLength(1);
    expect(first.summary?.billed).toHaveLength(1);
    expect(second.summary?.billed).toHaveLength(0);
    expect(second.summary?.excluded).toEqual([
      { leaseId: lease.id, leaseLabel: 'Fatoumata Diallo — Villa Kipé 12', reason: 'INSTALLMENT_ALREADY_EXISTS' }
    ]);
    expect(second.status).toBe('DONE');
    expect(second.id).toBe(first.id);
  });
});

describe('runRentBilling — motifs d’exclusion', () => {
  it('LEASE_NOT_ACTIVE : un bail suspendu est exclu avec ce motif', async () => {
    const lease = seedLease({ status: RentalLeaseStatus.SUSPENDED });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 9 }, ACTOR_ID);

    expect(result.summary?.excluded).toEqual([
      { leaseId: lease.id, leaseLabel: 'Fatoumata Diallo — Villa Kipé 12', reason: 'LEASE_NOT_ACTIVE' }
    ]);
  });

  it('PERIOD_BEFORE_LEASE_START : une periode anterieure au bail est exclue', async () => {
    const lease = seedLease({ start_date: new Date('2026-11-01T00:00:00.000Z') });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 9 }, ACTOR_ID);

    expect(result.summary?.excluded).toEqual([
      { leaseId: lease.id, leaseLabel: 'Fatoumata Diallo — Villa Kipé 12', reason: 'PERIOD_BEFORE_LEASE_START' }
    ]);
  });

  it('PERIOD_AFTER_LEASE_END : une periode posterieure a la fin du bail est exclue', async () => {
    const lease = seedLease({
      start_date: new Date('2025-01-01T00:00:00.000Z'),
      end_date: new Date('2026-06-30T00:00:00.000Z')
    });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 9 }, ACTOR_ID);

    expect(result.summary?.excluded).toEqual([
      { leaseId: lease.id, leaseLabel: 'Fatoumata Diallo — Villa Kipé 12', reason: 'PERIOD_AFTER_LEASE_END' }
    ]);
  });

  it('PERIOD_OFF_BILLING_CYCLE : un bail trimestriel hors cycle est exclu', async () => {
    const lease = seedLease({
      start_date: new Date('2026-01-01T00:00:00.000Z'),
      billing_frequency: RentalBillingFrequency.QUARTERLY
    });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 2 }, ACTOR_ID);

    expect(result.summary?.excluded).toEqual([
      { leaseId: lease.id, leaseLabel: 'Fatoumata Diallo — Villa Kipé 12', reason: 'PERIOD_OFF_BILLING_CYCLE' }
    ]);
  });

  it('LEASE_WITHOUT_AMOUNT : un bail qui ne doit rien est exclu', async () => {
    const lease = seedLease({ rent_amount: 0, service_charge_amount: 0 });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 9 }, ACTOR_ID);

    expect(result.summary?.excluded).toEqual([
      { leaseId: lease.id, leaseLabel: 'Fatoumata Diallo — Villa Kipé 12', reason: 'LEASE_WITHOUT_AMOUNT' }
    ]);
  });

  it('INSTALLMENT_ALREADY_EXISTS : une echeance deja presente en base est exclue sans etre recreee', async () => {
    const lease = seedLease();
    store.installments.push({
      id: nextId('inst'),
      tenant_id: TENANT_ID,
      lease_id: lease.id,
      period_year: 2026,
      period_month: 9,
      due_date: new Date('2026-09-05T00:00:00.000Z'),
      status: 'DUE',
      currency: 'FCFA',
      amount_rent: 100000,
      amount_service: 0,
      amount_other_fees: 0,
      penalty_amount: 0,
      amount_paid: 0
    });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 9 }, ACTOR_ID);

    expect(store.installments).toHaveLength(1);
    expect(result.summary?.excluded).toEqual([
      { leaseId: lease.id, leaseLabel: 'Fatoumata Diallo — Villa Kipé 12', reason: 'INSTALLMENT_ALREADY_EXISTS' }
    ]);
  });
});

describe('runRentBilling — bail trimestriel', () => {
  it("n'est facture qu'un mois sur trois", async () => {
    const lease = seedLease({
      start_date: new Date('2026-01-01T00:00:00.000Z'),
      billing_frequency: RentalBillingFrequency.QUARTERLY,
      rent_amount: 300000
    });

    const janvier = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 1 }, ACTOR_ID);
    const fevrier = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 2 }, ACTOR_ID);
    const avril = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 4 }, ACTOR_ID);

    expect(janvier.summary?.billed).toEqual([
      {
        leaseId: lease.id,
        leaseLabel: 'Fatoumata Diallo — Villa Kipé 12',
        installmentId: expect.any(String),
        amount: 300000
      }
    ]);
    expect(fevrier.summary?.excluded).toEqual([
      { leaseId: lease.id, leaseLabel: 'Fatoumata Diallo — Villa Kipé 12', reason: 'PERIOD_OFF_BILLING_CYCLE' }
    ]);
    expect(avril.summary?.billed).toEqual([
      {
        leaseId: lease.id,
        leaseLabel: 'Fatoumata Diallo — Villa Kipé 12',
        installmentId: expect.any(String),
        amount: 300000
      }
    ]);
    expect(store.installments).toHaveLength(2);
  });
});

describe('runRentBilling — avances', () => {
  it('impute une avance en totalite sur la nouvelle echeance', async () => {
    const lease = seedLease({ rent_amount: 100000 });
    seedPayment({ renter_client_id: lease.primary_renter_client_id, amount: 100000 });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 9 }, ACTOR_ID);

    expect(result.summary?.advancesApplied).toHaveLength(1);
    expect(result.summary?.advancesApplied[0]).toMatchObject({
      tenantClientId: lease.primary_renter_client_id,
      amount: 100000
    });
    const installment = store.installments[0];
    expect(installment.status).toBe('PAID');
    expect(Number(installment.amount_paid)).toBe(100000);
    expect(store.allocations).toHaveLength(1);

    // Imputer une avance ecrit DEUX mouvements, et sous la cle du
    // retro-remplissage. C'est ce qui empeche `rebuildThirdPartyAccount`, joue
    // apres une campagne, de creer un second credit pour la meme allocation —
    // le compte du locataire deviendrait faux sans que rien ne le signale.
    const allocationId = store.allocations[0].id;

    expect(appendThirdPartyMovementTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'ADVANCE_APPLIED',
        billed: 100000,
        sourceType: 'RENTAL_PAYMENT_ALLOCATION',
        sourceId: allocationId
      })
    );

    expect(appendThirdPartyMovementTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'PAYMENT',
        settled: 100000,
        sourceType: 'RENTAL_PAYMENT_ALLOCATION',
        sourceId: allocationId
      })
    );

    // Les deux s'annulent : le solde ne bouge pas, seul le releve s'enrichit.
    const mouvements = appendThirdPartyMovementTx.mock.calls
      .map(appel => appel[1])
      .filter((m: any) => m.sourceId === allocationId);
    const net =
      mouvements.reduce((total: number, m: any) => total + (m.billed ?? 0), 0) -
      mouvements.reduce((total: number, m: any) => total + (m.settled ?? 0), 0);
    expect(net).toBe(0);

    // Aucun mouvement n'est ecrit sous l'ancienne cle, qui divergeait du rejeu.
    expect(appendThirdPartyMovementTx).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceType: 'RENT_BILLING_RUN' })
    );
  });

  it("n'impute jamais sur un loyer l'argent déposé en garantie (BUG-2026-09-29-005)", async () => {
    const lease = seedLease({ rent_amount: 400000 });
    // Règlement de 800 000 entièrement collecté comme dépôt de garantie.
    seedPayment({ renter_client_id: lease.primary_renter_client_id, amount: 800000, depositCollected: 800000 });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 9 }, ACTOR_ID);

    expect(result.summary?.advancesApplied).toHaveLength(0);
    expect(store.allocations).toHaveLength(0);
    expect(store.installments[0].status).not.toBe('PAID');
  });

  it("n'impute que la part d'un règlement qui n'est pas déposée en garantie", async () => {
    const lease = seedLease({ rent_amount: 400000 });
    seedPayment({ renter_client_id: lease.primary_renter_client_id, amount: 1000000, depositCollected: 800000 });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 9 }, ACTOR_ID);

    expect(result.summary?.advancesApplied).toEqual([
      expect.objectContaining({ tenantClientId: lease.primary_renter_client_id, amount: 200000 })
    ]);
  });

  it('impute une avance partiellement et laisse le reliquat disponible', async () => {
    const lease = seedLease({ rent_amount: 100000 });
    seedPayment({ renter_client_id: lease.primary_renter_client_id, amount: 40000 });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 9 }, ACTOR_ID);

    expect(result.summary?.advancesApplied).toEqual([
      expect.objectContaining({ tenantClientId: lease.primary_renter_client_id, amount: 40000 })
    ]);
    const installment = store.installments[0];
    expect(installment.status).toBe('PARTIAL');
    expect(Number(installment.amount_paid)).toBe(40000);

    // Le paiement de 40 000 est integralement consomme : aucun reliquat ne
    // doit reapparaitre sur une seconde periode.
    const leaseOct = seedLease({
      rent_amount: 50000,
      primary_renter_client_id: lease.primary_renter_client_id
    });
    const resultOct = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 10 }, ACTOR_ID);
    const advanceForOct = resultOct.summary?.advancesApplied.find(a => a.installmentId !== installment.id);
    expect(advanceForOct).toBeUndefined();
    void leaseOct;
  });

  it('impute plusieurs avances du plus ancien au plus recent', async () => {
    const lease = seedLease({ rent_amount: 100000 });
    const ancien = seedPayment({
      renter_client_id: lease.primary_renter_client_id,
      amount: 30000,
      succeeded_at: new Date('2026-01-10T00:00:00.000Z')
    });
    const recent = seedPayment({
      renter_client_id: lease.primary_renter_client_id,
      amount: 90000,
      succeeded_at: new Date('2026-03-10T00:00:00.000Z')
    });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 9 }, ACTOR_ID);

    expect(result.summary?.advancesApplied).toEqual([
      expect.objectContaining({ sourcePaymentId: ancien.id, amount: 30000 }),
      expect.objectContaining({ sourcePaymentId: recent.id, amount: 70000 })
    ]);
    const installment = store.installments[0];
    expect(installment.status).toBe('PAID');
    expect(Number(installment.amount_paid)).toBe(100000);

    // Le reglement le plus recent garde un reliquat de 20 000 (90 000 - 70 000
    // consommes), disponible pour l'echeance suivante.
    const allocatedFromRecent = store.allocations
      .filter(a => a.payment_id === recent.id)
      .reduce((sum, a) => sum + Number(a.amount), 0);
    expect(Number(recent.amount) - allocatedFromRecent).toBe(20000);
  });
});

describe('runRentBilling — atomicite', () => {
  it("l'echec d'une ecriture n'ecrit rien : ni echeance, ni mouvement, ni allocation", async () => {
    seedLease({ rent_amount: 100000 });
    getOrCreateTenantAccountTx.mockRejectedValueOnce(new Error('grand livre indisponible'));

    await expect(runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 9 }, ACTOR_ID)).rejects.toThrow(
      'grand livre indisponible'
    );

    expect(store.installments).toHaveLength(0);
    expect(store.allocations).toHaveLength(0);
    expect(store.billingRuns).toHaveLength(1);
    expect(store.billingRuns[0].status).toBe(RentBillingRunStatus.FAILED);
  });
});
