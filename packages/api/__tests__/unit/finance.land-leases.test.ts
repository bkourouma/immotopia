/**
 * Tests des baux de terrain (`lib/finance/land-leases.ts`) — lot 4, premier
 * sous-lot.
 *
 * `accounting.ts` (moteur comptable général : `postDocumentEntryTx`,
 * l'amorçage du plan de comptes et du journal) est mocké, comme aux lots 2 et
 * 3 : ce fichier ne teste pas comment une écriture s'équilibre, seulement
 * comment `land-leases.ts` l'appelle (comptes, montants, labels).
 *
 * `lib/finance/cost-allocation.ts` (`syncWorkProgramCostTx`) est mocké lui
 * aussi, même geste qu'aux tests fournisseurs et caisse : ce fichier vérifie
 * qu'il est APPELÉ pour chaque chantier touché, jamais ce qu'il calcule en
 * interne (la synchronisation `WorkProgram` a ses propres tests).
 *
 * `lib/finance/ledger.ts` (`appendThirdPartyMovementTx`) et
 * `lib/finance/site-cost.ts` (`sumSiteActualCost`), en revanche, NE SONT PAS
 * mockés : ce sont les VRAIS calculs qui doivent prouver les deux critères de
 * sortie les plus importants du sous-lot — le solde du bailleur qui revient
 * exactement à zéro (§7.1), et le coût réel d'un chantier qui monte du
 * montant imputé quand une constatation le touche (la raison d'être du
 * sous-lot, cf. le message du coordinateur du 19 septembre 2026 : sans
 * imputation persistée, le loyer n'entrait jamais dans ce coût). Simuler ces
 * calculs à la main aurait surtout prouvé que la simulation est juste, pas
 * que le calcul réel l'est. Le magasin en mémoire ci-dessous implémente donc
 * les méthodes Prisma dont ces deux fichiers ont besoin.
 */

const postDocumentEntryTx = jest.fn();

const COMPTES_OPERATIONNELS = new Map<string, string>([
  // Lot 10 : 476 remplace 486 (numero corrige, consolidation SYSCOHADA).
  ['476', 'compte-476'],
  ['613', 'compte-613'],
  ['571', 'compte-571']
]);

// Lot 10 : la caisse ne se lit plus dans `accounting.ts` mais se resout par
// `treasury/accounts.ts`. On la mocke pour renvoyer le meme compte 571 qu'avant,
// afin que ce fichier continue de verifier les memes ecritures.
jest.mock('../../src/lib/treasury/accounts', () => ({
  ensureDefaultTreasuryAccountTx: async () => ({
    treasuryAccountId: 'tresorerie-571',
    chartOfAccountId: 'compte-571',
    accountNumber: '571',
    label: 'Caisse',
    kind: 'CASH',
    journal: 'CASH'
  })
}));

jest.mock('../../src/lib/finance/accounting', () => ({
  postDocumentEntryTx: (...args: any[]) => postDocumentEntryTx(...args),
  ensureOperationalJournalTx: async () => 'journal-operationnel',
  ensureOperationalChartOfAccountsTx: async () => COMPTES_OPERATIONNELS
}));

const syncWorkProgramCostTx = jest.fn();

jest.mock('../../src/lib/finance/cost-allocation', () => ({
  syncWorkProgramCostTx: (...args: any[]) => syncWorkProgramCostTx(...args)
}));

// ---------------------------------------------------------------------------
// Magasin en mémoire
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

const store = {
  accounts: [] as Row[],
  leases: [] as Row[],
  payments: [] as Row[],
  accruals: [] as Row[],
  sites: [] as Row[],
  movements: [] as Row[],
  categories: [] as Row[],
  allocations: [] as Row[],
  users: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function withCreatedBy(row: Row): Row {
  return { ...row, createdBy: store.users.find(u => u.id === row.createdByUserId) ?? null };
}

function withCostCategory(row: Row): Row {
  return { ...row, costCategory: store.categories.find(c => c.id === row.costCategoryId) ?? null };
}

const mockPrisma: Row = {
  // Lot 10 : `legacyPrepaidAccountTx` (land-leases.ts) lit ce modele pour
  // savoir si un compte '486' herite porte deja des ecritures. Aucune agence
  // de ces tests n'en a : la reprise ne joue jamais, et le compte 476 du mock
  // ci-dessous (COMPTES_OPERATIONNELS) est utilise a la place.
  chartOfAccount: {
    findFirst: jest.fn(async () => null)
  },

  thirdPartyAccount: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('acc'), ...data };
      store.accounts.push(created);
      return created;
    }),
    findFirst: jest.fn(
      async ({ where }: Row) => store.accounts.find(a => a.id === where.id && a.tenantId === where.tenantId) ?? null
    ),
    findMany: jest.fn(async ({ where }: Row) => store.accounts.filter(a => where.id.in.includes(a.id))),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.accounts.find(a => a.id === where.id)!;
      Object.assign(row, data);
      return row;
    })
  },

  landLease: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('bail'), isActive: true, createdAt: new Date(), ...data };
      store.leases.push(created);
      return created;
    }),
    findFirst: jest.fn(async ({ where, include }: Row) => {
      const row = store.leases.find(l => l.id === where.id && l.tenantId === where.tenantId);
      if (!row) return null;
      return include?.costCategory ? withCostCategory(row) : row;
    }),
    findMany: jest.fn(async ({ where, include }: Row) => {
      let rows = store.leases.filter(l => l.tenantId === where.tenantId || !where.tenantId);
      if (where.isActive !== undefined) rows = rows.filter(l => l.isActive === where.isActive);
      return include?.costCategory ? rows.map(withCostCategory) : rows;
    })
  },

  costCategory: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.categories.find(c => c.id === where.id && c.tenantId === where.tenantId) ?? null
    )
  },

  costAllocation: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('imputation'), voidedAt: null, createdAt: new Date(), ...data };
      store.allocations.push(created);
      return created;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.allocations.filter(a => a.tenantId === where.tenantId);
      if (where.sourceType) rows = rows.filter(a => a.sourceType === where.sourceType);
      if (where.sourceId?.in) rows = rows.filter(a => where.sourceId.in.includes(a.sourceId));
      if (where.siteId) rows = rows.filter(a => a.siteId === where.siteId);
      if (where.voidedAt === null) rows = rows.filter(a => a.voidedAt === null);
      if (where.validatedAt && where.validatedAt.not === null) rows = rows.filter(a => a.validatedAt !== null);
      return [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }),
    aggregate: jest.fn(async ({ where }: Row) => {
      let rows = store.allocations.filter(a => a.tenantId === where.tenantId && a.siteId === where.siteId);
      if (where.validatedAt && where.validatedAt.not === null) rows = rows.filter(a => a.validatedAt !== null);
      if (where.voidedAt === null) rows = rows.filter(a => a.voidedAt === null);
      const sum = rows.reduce(
        (total, row) => total + (typeof row.amount === 'number' ? row.amount : Number(row.amount)),
        0
      );
      return { _sum: { amount: rows.length ? sum : null } };
    })
  },

  constructionSite: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.sites.find(s => s.id === where.id && s.tenantId === where.tenantId) ?? null
    ),
    findMany: jest.fn(async ({ where }: Row) => {
      let rows = store.sites.filter(s => s.tenantId === where.tenantId);
      if (where.id?.in) {
        rows = rows.filter(s => where.id.in.includes(s.id));
      }
      if (where.landLeaseId?.in) {
        rows = rows.filter(s => where.landLeaseId.in.includes(s.landLeaseId));
      } else if ('landLeaseId' in where) {
        rows = rows.filter(s => s.landLeaseId === where.landLeaseId);
      }
      if (where.status?.in) {
        rows = rows.filter(s => where.status.in.includes(s.status));
      }
      return [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.sites.find(s => s.id === where.id)!;
      Object.assign(row, data);
      return row;
    })
  },

  landLeasePayment: {
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: nextId('paiement'),
        validatedAt: null,
        validatedByUserId: null,
        journalEntryId: null,
        createdAt: new Date(),
        ...data
      };
      store.payments.push(created);
      return withCreatedBy(created);
    }),
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = store.payments.find(p => p.id === where.id && p.tenantId === where.tenantId);
      return row ? withCreatedBy(row) : null;
    }),
    findMany: jest.fn(async ({ where }: Row) =>
      store.payments
        .filter(p => p.landLeaseId === where.landLeaseId && p.tenantId === where.tenantId)
        .map(withCreatedBy)
    ),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.payments.filter(
        p =>
          p.id === where.id &&
          p.tenantId === where.tenantId &&
          (where.validatedAt === undefined || p.validatedAt === where.validatedAt)
      );
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    })
  },

  landLeaseAccrual: {
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('constat'), journalEntryId: null, createdAt: new Date(), ...data };
      store.accruals.push(created);
      return created;
    }),
    findUnique: jest.fn(async ({ where }: Row) => {
      const key = where.landLeaseId_periodYear_periodMonth;
      return (
        store.accruals.find(
          a => a.landLeaseId === key.landLeaseId && a.periodYear === key.periodYear && a.periodMonth === key.periodMonth
        ) ?? null
      );
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.accruals.find(a => a.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      const rows = store.accruals.filter(a => a.landLeaseId === where.landLeaseId && a.tenantId === where.tenantId);
      return [...rows].sort((a, b) => a.periodYear - b.periodYear || a.periodMonth - b.periodMonth);
    })
  },

  thirdPartyMovement: {
    findUnique: jest.fn(async ({ where }: Row) => {
      const key = where.sourceType_sourceId_type;
      return (
        store.movements.find(
          m => m.sourceType === key.sourceType && m.sourceId === key.sourceId && m.type === key.type
        ) ?? null
      );
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('mvt'), createdAt: new Date(), ...data };
      store.movements.push(created);
      return created;
    })
  }
};

/** Rollback par copie profonde en cas d'erreur — même esprit que `finance.cash.test.ts`. */
async function runTransaction<T>(callback: (tx: Row) => Promise<T>): Promise<T> {
  const snapshot = {
    accounts: structuredClone(store.accounts),
    leases: structuredClone(store.leases),
    payments: structuredClone(store.payments),
    accruals: structuredClone(store.accruals),
    sites: structuredClone(store.sites),
    movements: structuredClone(store.movements),
    allocations: structuredClone(store.allocations),
    seq: store.seq
  };
  try {
    return await callback(mockPrisma);
  } catch (error) {
    store.accounts = snapshot.accounts;
    store.leases = snapshot.leases;
    store.payments = snapshot.payments;
    store.accruals = snapshot.accruals;
    store.sites = snapshot.sites;
    store.movements = snapshot.movements;
    store.allocations = snapshot.allocations;
    store.seq = snapshot.seq;
    throw error;
  }
}

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === '$transaction') {
          return (callback: any) => runTransaction(callback);
        }
        return (mockPrisma as any)[prop];
      }
    }
  )
}));

import {
  attachSiteToLandLeaseTx,
  createLandLeasePaymentTx,
  createLandLeaseTx,
  getLandLease,
  listLandLeaseAccruals,
  recordLandLeaseAccrualTx,
  runMonthlyLandLeaseAccruals,
  validateLandLeasePaymentTx
} from '../../src/lib/finance/land-leases';
// Coût réel d'un chantier — VRAI calcul, non mocké (voir l'en-tête du
// fichier) : c'est lui qui prouve que la constatation a bien fait monter le
// coût du chantier, pas une doublure qui l'affirmerait à sa place.
import { sumSiteActualCost } from '../../src/lib/finance/site-cost';

const TENANT_ID = 'tenant-1';
const GESTIONNAIRE_ID = 'user-gestionnaire';
const DIRIGEANT_ID = 'user-dirigeant';

function seedSite(overrides: Partial<Row> = {}): Row {
  const site = {
    id: nextId('chantier'),
    tenantId: TENANT_ID,
    name: `Chantier ${store.sites.length + 1}`,
    status: 'IN_PROGRESS',
    landLeaseId: null,
    createdAt: new Date(Date.now() + store.sites.length),
    ...overrides
  };
  store.sites.push(site);
  return site;
}

function seedCostCategory(overrides: Partial<Row> = {}): Row {
  const category = {
    id: nextId('poste'),
    tenantId: TENANT_ID,
    label: 'Locations diverses',
    isActive: true,
    ...overrides
  };
  store.categories.push(category);
  return category;
}

async function seedLease(overrides: Partial<Row> = {}): Promise<Row> {
  const costCategoryId = overrides.costCategoryId ?? seedCostCategory().id;
  return runTransaction((tx: any) =>
    createLandLeaseTx(tx, TENANT_ID, {
      landlordName: 'Mamadou Bah',
      landLabel: 'Terrain de Nongo, 800 m²',
      annualAmount: 1_000_000,
      startDate: new Date('2026-03-01T00:00:00.000Z'),
      ...overrides,
      costCategoryId
    })
  );
}

function monthSequence(startYear: number, startMonth: number, count: number) {
  const out: Array<{ periodYear: number; periodMonth: number }> = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < count; i += 1) {
    out.push({ periodYear: y, periodMonth: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

beforeEach(() => {
  jest.clearAllMocks();
  store.accounts = [];
  store.leases = [];
  store.payments = [];
  store.accruals = [];
  store.sites = [];
  store.movements = [];
  store.categories = [];
  store.allocations = [];
  store.users = [
    { id: GESTIONNAIRE_ID, fullName: 'Fatoumata Camara', email: 'f.camara@example.gn' },
    { id: DIRIGEANT_ID, fullName: 'Ibrahima Sory', email: 'i.sory@example.gn' }
  ];
  store.seq = 0;

  postDocumentEntryTx.mockImplementation(async () => ({ entryId: nextId('ecriture'), totalDebit: 0, totalCredit: 0 }));
});

// ---------------------------------------------------------------------------
// A. Enregistrement du bail
// ---------------------------------------------------------------------------

describe('createLandLeaseTx — enregistrement et compte de tiers', () => {
  it('ouvre un compte de tiers LANDLORD, calcule le douzième et résout le poste', async () => {
    const category = seedCostCategory({ label: 'Locations de terrains' });
    const lease = await seedLease({ annualAmount: 1_000_000, costCategoryId: category.id });

    expect(lease.landlordAccountId).toBeTruthy();
    expect(store.accounts).toHaveLength(1);
    expect(store.accounts[0].kind).toBe('LANDLORD');
    expect(lease.monthlyAmount).toBe(83_333);
    expect(lease.accountBalance).toBe(0);
    expect(lease.sites).toEqual([]);
    expect(lease.costCategoryId).toBe(category.id);
    expect(lease.costCategoryLabel).toBe('Locations de terrains');
  });

  it('refuse un montant annuel nul ou négatif', async () => {
    await expect(seedLease({ annualAmount: 0 })).rejects.toThrow(/positif/i);
  });

  it('refuse une date de fin antérieure ou égale à la date de début', async () => {
    await expect(seedLease({ startDate: new Date('2026-03-01'), endDate: new Date('2026-01-01') })).rejects.toThrow(
      /postérieure/i
    );
  });

  it('refuse un poste de dépense introuvable', async () => {
    await expect(seedLease({ costCategoryId: 'poste-inconnu' })).rejects.toThrow(/introuvable/i);
  });

  it('refuse un poste de dépense désactivé — un repli serait un choix invisible', async () => {
    const category = seedCostCategory({ isActive: false });
    await expect(seedLease({ costCategoryId: category.id })).rejects.toThrow(/désactivé/i);
  });
});

// ---------------------------------------------------------------------------
// B. Rattachement d'un chantier
// ---------------------------------------------------------------------------

describe('attachSiteToLandLeaseTx — rattachement et détachement', () => {
  it('rattache un chantier et le fait apparaître dans le bail', async () => {
    const lease = await seedLease();
    const site = seedSite();

    const updated = await runTransaction((tx: any) => attachSiteToLandLeaseTx(tx, TENANT_ID, site.id, lease.id));

    expect(updated).not.toBeNull();
    expect(updated!.sites).toEqual([{ siteId: site.id, siteLabel: site.name, status: 'IN_PROGRESS' }]);
  });

  it('détache un chantier et renvoie null', async () => {
    const lease = await seedLease();
    const site = seedSite({ landLeaseId: lease.id });

    const result = await runTransaction((tx: any) => attachSiteToLandLeaseTx(tx, TENANT_ID, site.id, null));

    expect(result).toBeNull();
    expect(store.sites.find(s => s.id === site.id)!.landLeaseId).toBeNull();
  });

  it('remplace le lien sans erreur quand le chantier dépendait déjà d’un autre bail', async () => {
    const leaseA = await seedLease({ landLabel: 'Terrain A' });
    const leaseB = await seedLease({ landLabel: 'Terrain B' });
    const site = seedSite({ landLeaseId: leaseA.id });

    const updated = await runTransaction((tx: any) => attachSiteToLandLeaseTx(tx, TENANT_ID, site.id, leaseB.id));

    expect(updated!.id).toBe(leaseB.id);
    expect(store.sites.find(s => s.id === site.id)!.landLeaseId).toBe(leaseB.id);
  });

  it('refuse un chantier introuvable', async () => {
    const lease = await seedLease();
    await expect(
      runTransaction((tx: any) => attachSiteToLandLeaseTx(tx, TENANT_ID, 'chantier-inconnu', lease.id))
    ).rejects.toThrow(/introuvable/i);
  });
});

// ---------------------------------------------------------------------------
// D/E. Paiement annuel — brouillon puis validation
// ---------------------------------------------------------------------------

describe('createLandLeasePaymentTx — brouillon', () => {
  it("n'écrit ni écriture ni mouvement", async () => {
    const lease = await seedLease();

    const payment = await runTransaction((tx: any) =>
      createLandLeasePaymentTx(tx, TENANT_ID, {
        landLeaseId: lease.id,
        paymentDate: new Date('2026-03-01'),
        amount: 1_000_000,
        coverageStartDate: new Date('2026-03-01'),
        coverageEndDate: new Date('2027-02-28'),
        createdByUserId: GESTIONNAIRE_ID
      })
    );

    expect(payment.status).toBe('DRAFT');
    expect(payment.validatedAt).toBeNull();
    expect(payment.createdByLabel).toBe('Fatoumata Camara');
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(store.movements).toHaveLength(0);
  });

  it('refuse une période couverte incohérente (fin avant début)', async () => {
    const lease = await seedLease();
    await expect(
      runTransaction((tx: any) =>
        createLandLeasePaymentTx(tx, TENANT_ID, {
          landLeaseId: lease.id,
          paymentDate: new Date('2026-03-01'),
          amount: 1_000_000,
          coverageStartDate: new Date('2027-02-28'),
          coverageEndDate: new Date('2026-03-01'),
          createdByUserId: GESTIONNAIRE_ID
        })
      )
    ).rejects.toThrow(/période/i);
  });
});

describe('validateLandLeasePaymentTx — écriture et mouvement', () => {
  async function payAndValidate(lease: Row, amount = 1_000_000) {
    const payment = await runTransaction((tx: any) =>
      createLandLeasePaymentTx(tx, TENANT_ID, {
        landLeaseId: lease.id,
        paymentDate: new Date('2026-03-01T00:00:00.000Z'),
        amount,
        coverageStartDate: new Date('2026-03-01'),
        coverageEndDate: new Date('2027-02-28'),
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    return runTransaction((tx: any) => validateLandLeasePaymentTx(tx, TENANT_ID, payment.id, DIRIGEANT_ID));
  }

  it('débite le 486, crédite le 571, et rend le bailleur débiteur (solde négatif)', async () => {
    const lease = await seedLease();

    const validated = await payAndValidate(lease);

    expect(validated.status).toBe('VALIDATED');
    expect(postDocumentEntryTx).toHaveBeenCalledTimes(1);
    const [, params] = postDocumentEntryTx.mock.calls[0];
    expect(params.documentType).toBe('LAND_LEASE_PAYMENT');
    expect(params.lines).toEqual([
      expect.objectContaining({ accountId: 'compte-476', debit: 1_000_000 }),
      expect.objectContaining({ accountId: 'compte-571', credit: 1_000_000 })
    ]);
    for (const line of params.lines) {
      expect(line.label.toLowerCase()).not.toMatch(/débit|crédit/);
    }

    const account = store.accounts.find(a => a.id === lease.landlordAccountId)!;
    expect(account.balance).toBe(-1_000_000);
  });

  it('refuse de valider un paiement déjà validé (principe P-6)', async () => {
    const lease = await seedLease();
    const payment = await runTransaction((tx: any) =>
      createLandLeasePaymentTx(tx, TENANT_ID, {
        landLeaseId: lease.id,
        paymentDate: new Date('2026-03-01'),
        amount: 1_000_000,
        coverageStartDate: new Date('2026-03-01'),
        coverageEndDate: new Date('2027-02-28'),
        createdByUserId: GESTIONNAIRE_ID
      })
    );
    await runTransaction((tx: any) => validateLandLeasePaymentTx(tx, TENANT_ID, payment.id, DIRIGEANT_ID));

    await expect(
      runTransaction((tx: any) => validateLandLeasePaymentTx(tx, TENANT_ID, payment.id, DIRIGEANT_ID))
    ).rejects.toThrow(/déjà validé/i);
  });
});

// ---------------------------------------------------------------------------
// G/H/I. La constatation mensuelle — cœur du sous-lot
// ---------------------------------------------------------------------------

describe('recordLandLeaseAccrualTx — le douzième et son reliquat', () => {
  it(
    'douze constatations successives ramènent le solde du bailleur EXACTEMENT à zéro, ' +
      "et le douzième mois absorbe le reliquat d'arrondi",
    async () => {
      // 1 000 000 / 12 ne tombe pas juste : 83 333,33 arrondi à 83 333, et le
      // douzième mois doit valoir 1 000 000 − 11 × 83 333 = 83 337.
      const lease = await seedLease({ startDate: new Date('2026-03-01T00:00:00.000Z'), annualAmount: 1_000_000 });

      const payment = await runTransaction((tx: any) =>
        createLandLeasePaymentTx(tx, TENANT_ID, {
          landLeaseId: lease.id,
          paymentDate: new Date('2026-03-01'),
          amount: 1_000_000,
          coverageStartDate: new Date('2026-03-01'),
          coverageEndDate: new Date('2027-02-28'),
          createdByUserId: GESTIONNAIRE_ID
        })
      );
      await runTransaction((tx: any) => validateLandLeasePaymentTx(tx, TENANT_ID, payment.id, DIRIGEANT_ID));

      expect(store.accounts.find(a => a.id === lease.landlordAccountId)!.balance).toBe(-1_000_000);

      // Le bail commence en mars : son cycle est mars 2026 → février 2027,
      // jamais janvier → décembre.
      const periods = monthSequence(2026, 3, 12);
      const accruals = [];
      for (const period of periods) {
        accruals.push(
          await runTransaction((tx: any) =>
            recordLandLeaseAccrualTx(tx, TENANT_ID, { landLeaseId: lease.id, ...period })
          )
        );
      }

      for (let i = 0; i < 11; i += 1) {
        expect(accruals[i].amount).toBe(83_333);
      }
      // Le douzième mois du cycle tombe en février 2027, et absorbe le reliquat.
      expect(accruals[11].periodYear).toBe(2027);
      expect(accruals[11].periodMonth).toBe(2);
      expect(accruals[11].amount).toBe(83_337);

      const sommeConstatee = accruals.reduce((sum, a) => sum + a.amount, 0);
      expect(sommeConstatee).toBe(1_000_000);

      const account = store.accounts.find(a => a.id === lease.landlordAccountId)!;
      expect(account.balance).toBe(0);
      expect(Object.is(account.balance, -0)).toBe(false);
    }
  );

  it('idempotence : un second appel sur le même triplet ne crée rien, ne bouge aucun solde, et ne double aucune imputation', async () => {
    const lease = await seedLease();
    const site = seedSite({ landLeaseId: lease.id });

    const first = await runTransaction((tx: any) =>
      recordLandLeaseAccrualTx(tx, TENANT_ID, { landLeaseId: lease.id, periodYear: 2026, periodMonth: 3 })
    );
    const balanceAfterFirst = store.accounts.find(a => a.id === lease.landlordAccountId)!.balance;
    const allocationsAfterFirst = store.allocations.length;

    postDocumentEntryTx.mockClear();
    syncWorkProgramCostTx.mockClear();

    const second = await runTransaction((tx: any) =>
      recordLandLeaseAccrualTx(tx, TENANT_ID, { landLeaseId: lease.id, periodYear: 2026, periodMonth: 3 })
    );

    expect(second).toEqual(first);
    expect(second.allocations).toEqual([{ siteId: site.id, siteLabel: site.name, amount: 83_333 }]);
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
    expect(syncWorkProgramCostTx).not.toHaveBeenCalled();
    expect(store.accruals).toHaveLength(1);
    expect(store.movements).toHaveLength(1);
    expect(store.allocations).toHaveLength(allocationsAfterFirst);
    expect(store.accounts.find(a => a.id === lease.landlordAccountId)!.balance).toBe(balanceAfterFirst);
  });

  it('répartit au prorata (parts égales, reliquat au premier chantier créé) quand le compte ne tombe pas juste, avec de VRAIES imputations', async () => {
    const lease = await seedLease({ startDate: new Date('2026-03-01T00:00:00.000Z'), annualAmount: 1_000_000 });
    const siteA = seedSite({ landLeaseId: lease.id });
    const siteB = seedSite({ landLeaseId: lease.id });
    const siteC = seedSite({ landLeaseId: lease.id });

    // Premier mois du cycle : 83 333, non divisible par 3 chantiers.
    const accrual = await runTransaction((tx: any) =>
      recordLandLeaseAccrualTx(tx, TENANT_ID, { landLeaseId: lease.id, periodYear: 2026, periodMonth: 3 })
    );

    expect(accrual.amount).toBe(83_333);
    expect(accrual.allocations).toHaveLength(3);
    const somme = accrual.allocations.reduce((sum, a) => sum + a.amount, 0);
    expect(somme).toBe(accrual.amount);

    // Le premier chantier créé absorbe le reliquat d'arrondi.
    const parSite = new Map(accrual.allocations.map(a => [a.siteId, a.amount]));
    expect(parSite.get(siteA.id)).toBe(27_779);
    expect(parSite.get(siteB.id)).toBe(27_777);
    expect(parSite.get(siteC.id)).toBe(27_777);

    // Trois VRAIES lignes `CostAllocation`, une par chantier — plus le talon
    // que `sumSiteActualCost` lit exactement : poste du bail, source de la
    // constatation, validée, non annulée.
    expect(store.allocations).toHaveLength(3);
    for (const row of store.allocations) {
      expect(row).toMatchObject({
        tenantId: TENANT_ID,
        costCategoryId: lease.costCategoryId,
        sourceType: 'LAND_LEASE_ACCRUAL',
        sourceId: accrual.id
      });
      expect(row.validatedAt).not.toBeNull();
      expect(row.voidedAt).toBeNull();
    }

    // Chaque chantier touché est synchronisé, dans la même transaction.
    expect(syncWorkProgramCostTx).toHaveBeenCalledTimes(3);
    expect(syncWorkProgramCostTx.mock.calls.map((call: any[]) => call[2]).sort()).toEqual(
      [siteA.id, siteB.id, siteC.id].sort()
    );
  });

  it(
    'LE TEST LE PLUS IMPORTANT : après une constatation, le coût réel du chantier a monté du montant imputé ' +
      '(sumSiteActualCost, calcul réel, non mocké)',
    async () => {
      const lease = await seedLease({ startDate: new Date('2026-03-01T00:00:00.000Z'), annualAmount: 1_000_000 });
      const site = seedSite({ landLeaseId: lease.id });

      const coutAvant = await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id);
      expect(coutAvant).toBe(0);

      const accrual = await runTransaction((tx: any) =>
        recordLandLeaseAccrualTx(tx, TENANT_ID, { landLeaseId: lease.id, periodYear: 2026, periodMonth: 3 })
      );

      const coutApres = await sumSiteActualCost(mockPrisma as any, TENANT_ID, site.id);
      expect(coutApres).toBe(coutAvant + accrual.amount);
      expect(coutApres).toBe(83_333);

      // Le geste d'orchestration attendu par le coordinateur : le programme de
      // travaux rattaché à ce chantier doit être resynchronisé pour refléter
      // ce nouveau coût, dans la même transaction que l'imputation.
      expect(syncWorkProgramCostTx).toHaveBeenCalledWith(expect.anything(), TENANT_ID, site.id);
    }
  );

  it('un bail sans chantier actif se constate quand même, sans imputation ni synchronisation', async () => {
    const lease = await seedLease();

    const accrual = await runTransaction((tx: any) =>
      recordLandLeaseAccrualTx(tx, TENANT_ID, { landLeaseId: lease.id, periodYear: 2026, periodMonth: 3 })
    );

    expect(accrual.amount).toBe(83_333);
    expect(accrual.allocations).toEqual([]);
    expect(postDocumentEntryTx).toHaveBeenCalledTimes(1);
    expect(store.movements).toHaveLength(1);
    expect(store.allocations).toHaveLength(0);
    expect(syncWorkProgramCostTx).not.toHaveBeenCalled();
  });

  it('exclut un chantier CLOS de la répartition et de l’imputation', async () => {
    const lease = await seedLease();
    const siteActif = seedSite({ landLeaseId: lease.id, status: 'IN_PROGRESS' });
    const siteClos = seedSite({ landLeaseId: lease.id, status: 'CLOSED' });

    const accrual = await runTransaction((tx: any) =>
      recordLandLeaseAccrualTx(tx, TENANT_ID, { landLeaseId: lease.id, periodYear: 2026, periodMonth: 3 })
    );

    expect(accrual.allocations).toEqual([{ siteId: siteActif.id, siteLabel: siteActif.name, amount: accrual.amount }]);
    expect(store.allocations.map(a => a.siteId)).toEqual([siteActif.id]);
    expect(await sumSiteActualCost(mockPrisma as any, TENANT_ID, siteClos.id)).toBe(0);
    expect(syncWorkProgramCostTx).toHaveBeenCalledTimes(1);
    expect(syncWorkProgramCostTx).toHaveBeenCalledWith(expect.anything(), TENANT_ID, siteActif.id);
  });

  it('refuse une période antérieure à la date de début du bail', async () => {
    const lease = await seedLease({ startDate: new Date('2026-03-01T00:00:00.000Z') });
    await expect(
      runTransaction((tx: any) =>
        recordLandLeaseAccrualTx(tx, TENANT_ID, { landLeaseId: lease.id, periodYear: 2026, periodMonth: 1 })
      )
    ).rejects.toThrow(/antérieure/i);
  });
});

describe('listLandLeaseAccruals', () => {
  it('renvoie les constatations triées par période', async () => {
    const lease = await seedLease({ startDate: new Date('2026-03-01T00:00:00.000Z') });
    await runTransaction((tx: any) =>
      recordLandLeaseAccrualTx(tx, TENANT_ID, { landLeaseId: lease.id, periodYear: 2026, periodMonth: 4 })
    );
    await runTransaction((tx: any) =>
      recordLandLeaseAccrualTx(tx, TENANT_ID, { landLeaseId: lease.id, periodYear: 2026, periodMonth: 3 })
    );

    const accruals = await listLandLeaseAccruals(TENANT_ID, lease.id);

    expect(accruals.map(a => a.periodMonth)).toEqual([3, 4]);
  });

  it(
    "montre la répartition RÉELLEMENT persistée d'une constatation ancienne, " +
      'même après un rattachement de chantier survenu depuis (la fissure de l’hypothèse n°1 est refermée)',
    async () => {
      const lease = await seedLease({ startDate: new Date('2026-03-01T00:00:00.000Z') });
      const siteInitial = seedSite({ landLeaseId: lease.id });

      const accrual = await runTransaction((tx: any) =>
        recordLandLeaseAccrualTx(tx, TENANT_ID, { landLeaseId: lease.id, periodYear: 2026, periodMonth: 3 })
      );

      // Un second chantier est rattaché APRÈS la constatation : la relire ne
      // doit rien montrer de ce nouveau chantier, puisque l'imputation
      // d'origine est déjà persistée et validée.
      const siteTardif = seedSite({ landLeaseId: lease.id });

      const accruals = await listLandLeaseAccruals(TENANT_ID, lease.id);

      expect(accruals).toHaveLength(1);
      expect(accruals[0].allocations).toEqual([
        { siteId: siteInitial.id, siteLabel: siteInitial.name, amount: accrual.amount }
      ]);
      expect(accruals[0].allocations.some(a => a.siteId === siteTardif.id)).toBe(false);
    }
  );

  it('une constatation sans imputation (bail sans chantier actif) renvoie une liste vide, pas une entrée fantôme', async () => {
    const lease = await seedLease({ startDate: new Date('2026-03-01T00:00:00.000Z') });
    await runTransaction((tx: any) =>
      recordLandLeaseAccrualTx(tx, TENANT_ID, { landLeaseId: lease.id, periodYear: 2026, periodMonth: 3 })
    );

    const accruals = await listLandLeaseAccruals(TENANT_ID, lease.id);

    expect(accruals[0].allocations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// J. Travail programmé
// ---------------------------------------------------------------------------

describe('runMonthlyLandLeaseAccruals — chaque bail dans sa propre transaction', () => {
  it("constate les baux valides, isole l'échec d'un bail mal configuré, et se rejoue sans doubler", async () => {
    const leaseOk = await seedLease({ landLabel: 'Terrain sain' });
    const leaseKo = await seedLease({ landLabel: 'Terrain casse' });
    // Compte du bailleur supprimé après coup : simule un bail mal configuré.
    store.accounts = store.accounts.filter(a => a.id !== leaseKo.landlordAccountId);
    // Un bail inactif ne doit jamais être traité.
    await seedLease({ landLabel: 'Terrain inactif', annualAmount: 500_000 }).then(inactif =>
      Object.assign(
        store.leases.find(l => l.id === inactif.id)!,
        { isActive: false }
      )
    );

    const premierPassage = await runMonthlyLandLeaseAccruals({ tenantId: TENANT_ID, periodYear: 2026, periodMonth: 3 });

    expect(premierPassage.constatees).toBe(1);
    expect(premierPassage.dejaConstatees).toBe(0);
    expect(premierPassage.echecs).toHaveLength(1);
    expect(premierPassage.echecs[0]).toMatchObject({ landLeaseId: leaseKo.id, landlordName: 'Mamadou Bah' });
    expect(store.accruals.filter(a => a.landLeaseId === leaseOk.id)).toHaveLength(1);
    expect(store.accruals.filter(a => a.landLeaseId === leaseKo.id)).toHaveLength(0);

    const secondPassage = await runMonthlyLandLeaseAccruals({ tenantId: TENANT_ID, periodYear: 2026, periodMonth: 3 });

    expect(secondPassage.constatees).toBe(0);
    expect(secondPassage.dejaConstatees).toBe(1);
    expect(secondPassage.echecs).toHaveLength(1);
    expect(store.accruals.filter(a => a.landLeaseId === leaseOk.id)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// C. Lecture — getLandLease
// ---------------------------------------------------------------------------

describe('getLandLease', () => {
  it('renvoie le solde et les chantiers rattachés', async () => {
    const lease = await seedLease();
    const site = seedSite({ landLeaseId: lease.id });

    const found = await getLandLease(TENANT_ID, lease.id);

    expect(found.sites).toEqual([{ siteId: site.id, siteLabel: site.name, status: site.status }]);
    expect(found.accountBalance).toBe(0);
  });

  it('refuse un bail introuvable', async () => {
    await expect(getLandLease(TENANT_ID, 'bail-inconnu')).rejects.toThrow(/introuvable/i);
  });
});
