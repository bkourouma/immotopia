/**
 * Génération des échéances : calcul des périodes (jours 29-31, bail d'un an,
 * bail sans date de fin) et dates d'échéance en mois courts.
 */
import { RentalBillingFrequency } from '@prisma/client';

type Row = Record<string, any>;
const store = { lease: {} as Row, created: [] as Row[] };

const mockPrisma: Row = {
  // Simule le retour arrière : si le callback échoue, les créations de la transaction disparaissent.
  $transaction: jest.fn(async (fn: (tx: Row) => Promise<unknown>) => {
    const snapshot = [...store.created];
    try {
      return await fn(mockPrisma);
    } catch (error) {
      store.created = snapshot;
      throw error;
    }
  }),
  rentalLease: { findFirst: jest.fn(async () => ({ ...store.lease })) },
  leaseEvent: { findMany: jest.fn(async () => []) },
  rentalInstallment: {
    count: jest.fn(async () => 0),
    findUnique: jest.fn(async () => null),
    create: jest.fn(async ({ data }: Row) => {
      store.created.push(data);
      return data;
    })
  }
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: jest.fn(),
  getOrCreateTenantAccountTx: jest.fn()
}));

import { generateInstallments } from '../../src/services/rental-installment-service';
import { listBillingPeriods } from '../../src/lib/rental/installment-periods';

const F = RentalBillingFrequency;
const d = (iso: string) => new Date(`${iso}T12:00:00`);

async function generer(start: string, end: string | null, freq: RentalBillingFrequency, dueDay = 5) {
  store.created = [];
  store.lease = {
    id: 'l1',
    tenant_id: 't1',
    status: 'ACTIVE',
    start_date: d(start),
    end_date: end ? d(end) : null,
    billing_frequency: freq,
    due_day_of_month: dueDay,
    rent_amount: 100000,
    service_charge_amount: 0,
    currency: 'FCFA'
  };
  await generateInstallments('t1', 'l1', 'u1');
  return store.created;
}
const mois = (rows: Row[]) => rows.map(r => `${r.period_year}-${String(r.period_month).padStart(2, '0')}`);

describe('generateInstallments — périodes', () => {
  it('mensuel 31/01 -> 31/12 : 12 échéances, février comprise', async () => {
    const rows = await generer('2026-01-31', '2026-12-31', F.MONTHLY);
    expect(rows).toHaveLength(12);
    expect(mois(rows)).toContain('2026-02');
  });

  it('trimestriel 31/01/2026 -> 31/12/2026 : 4 échéances', async () => {
    const rows = await generer('2026-01-31', '2026-12-31', F.QUARTERLY);
    expect(mois(rows)).toEqual(['2026-01', '2026-04', '2026-07', '2026-10']);
  });

  it('mensuel 30/01/2028 (bissextile) : février 2028 présente', async () => {
    const rows = await generer('2028-01-30', '2028-12-31', F.MONTHLY);
    expect(rows).toHaveLength(12);
  });

  it('bail 01/07/2026 -> 30/06/2027 : 12 échéances', async () => {
    expect(await generer('2026-07-01', '2027-06-30', F.MONTHLY)).toHaveLength(12);
  });

  it('bail 01/07/2026 -> 01/07/2027 : pas de 13e période pour un jour', async () => {
    expect(await generer('2026-07-01', '2027-07-01', F.MONTHLY)).toHaveLength(12);
  });

  it('bail sans date de fin : 12 échéances mensuelles', async () => {
    expect(await generer('2026-07-01', null, F.MONTHLY)).toHaveLength(12);
  });

  it('cas déjà justes inchangés : trimestriel, semestriel, annuel', async () => {
    expect(await generer('2026-01-01', '2026-12-31', F.QUARTERLY)).toHaveLength(4);
    expect(await generer('2026-01-01', '2026-12-31', F.SEMIANNUAL)).toHaveLength(2);
    expect(await generer('2026-01-01', '2026-12-31', F.ANNUAL)).toHaveLength(1);
  });

  it('échéance au 31 : dernier jour des mois courts, une seule par mois (2027 et 2028)', async () => {
    for (const [s, e] of [
      ['2027-01-01', '2027-12-31'],
      ['2028-01-01', '2028-12-31']
    ]) {
      const rows = await generer(s, e, F.MONTHLY, 31);
      expect(rows).toHaveLength(12);
      expect(new Set(mois(rows)).size).toBe(12);
      const fev = rows.find(r => r.period_month === 2)!;
      expect(fev.due_date.getDate()).toBe(fev.period_year === 2028 ? 29 : 28);
      expect(fev.due_date.getMonth()).toBe(1);
      const avril = rows.find(r => r.period_month === 4)!;
      expect(avril.due_date.getDate()).toBe(30);
    }
  });

  it('échéance au 30 en février', async () => {
    const rows = await generer('2027-01-01', '2027-12-31', F.MONTHLY, 30);
    expect(rows.find(r => r.period_month === 2)!.due_date.getDate()).toBe(28);
  });
});

describe('generateInstallments — prorata au jour (H5)', () => {
  const montants = (rows: Row[]) => rows.map(r => Number(r.amount_rent));

  it('bail 15/07/2026 -> 14/07/2027 : 13 échéances, extrémités 17/31 et 14/31', async () => {
    const rows = await generer('2026-07-15', '2027-07-14', F.MONTHLY);
    expect(rows).toHaveLength(13);
    const m = montants(rows);
    expect(m[0]).toBe(54839); // 100 000 x 17/31
    expect(m[12]).toBe(45161); // 100 000 x 14/31
    expect(m[0] + m[12]).toBe(100000);
    expect(m.slice(1, 12).every(v => v === 100000)).toBe(true);
  });

  it('bail sans date de fin démarrant le 15/07/2026 : horizon d’un an, extrémités = un mois', async () => {
    const rows = await generer('2026-07-15', null, F.MONTHLY);
    expect(rows).toHaveLength(13);
    const m = montants(rows);
    expect(m[0] + m[12]).toBe(100000);
  });

  it('bail démarrant le 1er : 12 échéances pleines, inchangé', async () => {
    const rows = await generer('2026-07-01', '2027-06-30', F.MONTHLY);
    expect(montants(rows)).toEqual(Array(12).fill(100000));
    const sansFin = await generer('2026-07-01', null, F.MONTHLY);
    expect(montants(sansFin)).toEqual(Array(12).fill(100000));
  });

  it('bail 01/07/2026 -> 01/07/2027 : 12 échéances pleines (pas de période d’un jour)', async () => {
    const rows = await generer('2026-07-01', '2027-07-01', F.MONTHLY);
    expect(montants(rows)).toEqual(Array(12).fill(100000));
  });
});

describe('generateInstallments — transactionnel', () => {
  it('un échec en milieu de génération ne laisse rien de créé', async () => {
    store.created = [];
    store.lease = {
      id: 'l1',
      tenant_id: 't1',
      status: 'ACTIVE',
      start_date: d('2026-07-01'),
      end_date: d('2027-06-30'),
      billing_frequency: F.MONTHLY,
      due_day_of_month: 5,
      rent_amount: 100000,
      service_charge_amount: 0,
      currency: 'FCFA'
    };
    let calls = 0;
    mockPrisma.rentalInstallment.create.mockImplementation(async ({ data }: Row) => {
      calls += 1;
      if (calls === 6) throw new Error('panne en cours de route');
      store.created.push(data);
      return data;
    });
    await expect(generateInstallments('t1', 'l1', 'u1')).rejects.toThrow('panne en cours de route');
    expect(store.created).toHaveLength(0);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    // Restaure le comportement nominal pour les autres tests.
    mockPrisma.rentalInstallment.create.mockImplementation(async ({ data }: Row) => {
      store.created.push(data);
      return data;
    });
  });

  it('le contrôle « échéances déjà existantes » se fait dans la transaction et lève ConflictError', async () => {
    store.created = [];
    store.lease = {
      id: 'l1',
      tenant_id: 't1',
      status: 'ACTIVE',
      start_date: d('2026-07-01'),
      end_date: d('2027-06-30'),
      billing_frequency: F.MONTHLY,
      due_day_of_month: 5,
      rent_amount: 100000,
      service_charge_amount: 0,
      currency: 'FCFA'
    };
    mockPrisma.rentalInstallment.count.mockImplementationOnce(async () => 3);
    await expect(generateInstallments('t1', 'l1', 'u1')).rejects.toMatchObject({ statusCode: 409 });
    expect(store.created).toHaveLength(0);
  });
});

describe('listBillingPeriods', () => {
  it('périodes contiguës, fin = dernier jour du mois', () => {
    const p = listBillingPeriods(d('2026-01-31'), d('2026-12-31'), F.MONTHLY);
    expect(p).toHaveLength(12);
    expect(p[0].end.getDate()).toBe(31);
    expect(p[1].start.getDate()).toBe(1);
    expect(p[1].start.getMonth()).toBe(1);
  });
});
